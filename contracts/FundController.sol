// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import "solady/src/utils/FixedPointMathLib.sol";
import "./interfaces/IERC20Extended.sol";
import "./interfaces/IFundToken.sol";
import "./FundToken.sol";
import "./interfaces/ISwapRouterExtended.sol";

import "hardhat/console.sol";

struct Proposal
{
    uint256 id;
    address proposer;
    address assetToTrade;
    address assetToReceive;
    uint256 amountIn;
    // Will be 0 until intentToAccept is called by the governor
    uint256 approvalTimelockEnd;
}

struct Proposer
{
    address proposer;
    Proposal[] acceptedProposals;
}

contract FundController is Ownable
{
    uint256 public s_epochDuration;
    uint256 public s_epochExpirationTime;

    // Harcoding to 1 day for now, but could make settable like epoch duration
    // Although, unlike epoch duration we should not let governors change it
    uint256 public s_proposalAcceptTimelockDuration = 86400;

    // Percentages are defined in WAD (1e18)
    // e.g., 1% = 0.01e18 = 1e16
    uint256 public s_proposalPercentageReward;
    uint256 public s_governorPercentageReward;

    // This value is used to determine the amount of FundToken to mint
    // when the fund is empty. We will define it to be 1 FundToken = $100
    uint256 constant public initialFundTokenValue = 100e18;

    uint256[] public s_activeProposalIds;

    uint256 public totalAcceptedProposals;
    // mapping of proposalId to the the proposal
    mapping(uint256 => Proposal) public proposals;
    
    Proposer[] public successfulProposers;

    uint256 latestProposalId;

    IERC20Extended private s_IUSDC;
    AggregatorV3Interface private usdcAggregator;
    IFundToken private s_IFundToken;

    constructor(uint256 _initialEpochTime,
               uint256 _initialProposalPercentageReward,
               uint256 _initialGovernorPercentageReward,
               address _usdcAddress, address usdcAggregatorAddress)
               Ownable(msg.sender)
    {
        s_epochDuration = _initialEpochTime;
        s_proposalPercentageReward = _initialProposalPercentageReward;
        s_governorPercentageReward = _initialGovernorPercentageReward;
        s_IUSDC = IERC20Extended(_usdcAddress);
        usdcAggregator = AggregatorV3Interface(usdcAggregatorAddress);
    }

    function initialize(address _fundTokenAddress) external
    {
        s_IFundToken = IFundToken(_fundTokenAddress);
        latestProposalId = 1;
        s_epochExpirationTime = block.timestamp + s_epochDuration;
    }

    // setter functions for how the protocol opperates
    // TODO: Require epoch duration results in perfectly divisbile epochs per year? Require it is less than 1 year?
    function setEpochDuration(uint256 _epochDuration) external onlyOwner
    {
        require(_epochDuration >= 60 * 60 * 24 && _epochDuration <= 60 * 60 * 24 * 365, "Epoch duration must be between 1 day and 1 year");
        s_epochDuration = _epochDuration;
    }

    function setProposalPercentageReward(uint256 _percentage) external onlyOwner
    { s_proposalPercentageReward = _percentage; }

    function setGovernorPercentageReward(uint256 _percentage) external onlyOwner
    { s_governorPercentageReward = _percentage; }

    /// Get normalized USDC/USD price in fixed-point (1e18) format
    function getUsdcPrice() internal view returns (uint256) {
        (
            , // roundId
            int256 price, // answer
            , // startedAt
            uint256 updatedAt,
            // answeredInRound
        ) = usdcAggregator.latestRoundData();

        require(updatedAt > 0 && price > 0, "Stale or invalid price");

        return uint256(price) * (10 ** (18 - usdcAggregator.decimals()));
    }

    function issueUsingStableCoin(uint256 _USDCContributed) external
    {
        realizeFundFees();
        uint256 allowance = s_IUSDC.allowance(msg.sender, address(this));
        require(allowance >= _USDCContributed, "You must approve the contract to spend your USDC");

        uint256 usdcContributedInWAD = _USDCContributed * 10 ** (18 - s_IUSDC.decimals());

        // NOTE: mulWad rounds down
        uint256 dollarValue = FixedPointMathLib.mulWad(usdcContributedInWAD, getUsdcPrice());

        // this initial rate makes 1fToken = $100
        uint256 amountToMint;

        // if this is the first time the fund token is being minted
        // base it off of the dollar amount such that 1 fund token = $100
        if (s_IFundToken.totalSupply() == 0)
        {
            amountToMint = FixedPointMathLib.divWad(dollarValue, initialFundTokenValue);
        }
        // otherwise mint such that the ratio of totalSupply to totalFundValue is preserved
        else
        {
            amountToMint = FixedPointMathLib.divWad(FixedPointMathLib.mulWad(dollarValue,
                                                s_IFundToken.totalSupply()), s_IFundToken.getTotalValueOfFund());
        }

        // then perform the transfer from function
        s_IUSDC.transferFrom(msg.sender, address(s_IFundToken), _USDCContributed);

        s_IFundToken.mint(msg.sender, amountToMint);
    }

    function redeemAssets(uint256 _rawFTokenToRedeem) public
    {
        realizeFundFees();
        // redeem the assets first
        require(s_IFundToken.balanceOf(msg.sender) >= _rawFTokenToRedeem, "You do not have enough FUND tokens to redeem");
        // for now we will redeem assets by giving the user
        // his proportional share of each underlying asset of the fund

        asset[] memory fundAssets = s_IFundToken.getAssets();
        for (uint256 i = 0; i < fundAssets.length; i++)
        {
            IERC20 assetToRedeem = fundAssets[i].token;
            // TODO: confirm if we should be using mulWad here (do things break if assetToRedeem is not in WAD)
            uint256 amountToRedeem = FixedPointMathLib.divWad(FixedPointMathLib.mulWad(_rawFTokenToRedeem, assetToRedeem.balanceOf(address(s_IFundToken))), s_IFundToken.totalSupply());
            // transfer the asset to the user
            assetToRedeem.transferFrom(address(s_IFundToken), msg.sender, amountToRedeem);
        }
        // TODO: look into re-entry attack, should we burn before distributing the assets?
        // burn the fund tokens
        s_IFundToken.burn(msg.sender, _rawFTokenToRedeem);
    }

    // Computes: Per Epoch Fee=(1 + Annual Fee)**(1/N) − 1
    // N = epochsPerYear
    function perEpochFeePercentage(uint256 _annualFeePercentage) internal view returns (uint256)
    {
        // NOTE: not adjusted for years without exactly 365 days
        uint256 epochsPerYear = 31_536_000 / s_epochDuration;

        // 1 / epochsPerYear
        uint256 exponent = FixedPointMathLib.divWad(1e18, epochsPerYear * 1e18);

        // NOTE: powWad is an approximation according to docs
        uint256 growthFactor = uint256(FixedPointMathLib.powWad(int256(1e18 + _annualFeePercentage), int256(exponent)));

        // Subtract 1e18 to get just the fee
        return growthFactor - 1e18;
    }

    function realizeFundFees() public
    {
        // if the epoch hasn't ended there are no payouts
        uint256 elapsedEpochs = elapsedEpochCount();
        if (elapsedEpochs == 0)
        {
            return;
        }

        // all payouts should be based on the supply before the payouts for this epoch
        uint256 totalSupply = s_IFundToken.totalSupply();

        // payout Proposers
        // NOTE: if there are no successfulProposers, then no proposer fee is taken for that epoch
        // TODO: consider if this fee should instead go to the governors
        for(uint256 i = 0; i < successfulProposers.length; i++)
        {
            Proposer storage proposer = successfulProposers[i];

            // for now, rewards are just based on the total number of accepted proposals
            uint256 acceptedProposalCount = proposer.acceptedProposals.length;

            // this needs to be Mul because the fee is in "decimal form" (meaning < 1e18)
            // so you need to do mulWad 
            uint256 rewardForProposer = FixedPointMathLib.mulWad(
                FixedPointMathLib.mulWad(totalSupply, acceptedProposalCount * 1e18),
                FixedPointMathLib.divWad(perEpochFeePercentage(s_proposalPercentageReward), totalAcceptedProposals * 1e18));

            // pay the proposer their reward
            s_IFundToken.mint(proposer.proposer, rewardForProposer);
        }
        delete successfulProposers;
        totalAcceptedProposals = 0;

        // payout Governor
        address governor = owner();
        uint256 rewardForGovernor = FixedPointMathLib.mulWad(FixedPointMathLib.mulWad(
            totalSupply, perEpochFeePercentage(s_governorPercentageReward)), elapsedEpochs * 1e18);

        s_IFundToken.mint(governor, rewardForGovernor);
    }

    function addAssetToFund(address _assetAddress, address _aggregatorAddress) external onlyOwner
    {
        s_IFundToken.addAsset(_assetAddress, _aggregatorAddress);
    }

    // returns the number of epochs since the deadline was last set
    // also, sets s_epochExpirationTime to the next epoch deadline after the current time
    // NOTE: some epochs may be skipped if no actions occured and we count these for fee accrual
    function elapsedEpochCount() internal returns (uint256 elapsedEpochs)
    {
        elapsedEpochs = 0;
        while (block.timestamp > s_epochExpirationTime)
        {
            s_epochExpirationTime += s_epochDuration;
            elapsedEpochs++;
        }
        return elapsedEpochs;
    }

    function createProposal(address _assetToTrade, address _assetToReceive, uint256 _amountIn) external
    {
        Proposal memory proposalToCreate = Proposal(
            latestProposalId,
            msg.sender,
            _assetToTrade,
            _assetToReceive,
            _amountIn,
            0);
        proposals[latestProposalId] = proposalToCreate;
        s_activeProposalIds.push(latestProposalId);
        latestProposalId++;
    }

    function getActiveProposals() external view returns(Proposal[] memory activeProposals)
    {
        activeProposals = new Proposal[](s_activeProposalIds.length);
        for(uint256 i = 0; i < s_activeProposalIds.length; i++)
        {
            activeProposals[i] = proposals[s_activeProposalIds[i]];
        }
        return activeProposals;
    }

    // Returns the index of the proposer in successfulProposers or returns -1 if they aren't
    // a successful proposer
    function checkIsSuccessfulProposer(address _proposer) public view returns (int256 index)
    {
        index = -1;
        for(uint256 i = 0; i < successfulProposers.length; i++)
        {
            if(successfulProposers[i].proposer == _proposer)
            {
                return int256(i);
            }
        }
        return index;
    }

    function intentToAccept(uint256 proposalIdToAccept) external onlyOwner
    {
        Proposal storage proposalToAccept = proposals[proposalIdToAccept];
        proposalToAccept.approvalTimelockEnd = block.timestamp + s_proposalAcceptTimelockDuration;
    }

    function acceptProposal(uint256 proposalIdToAccept) external onlyOwner
        returns (uint256 amountOut)
    {
        realizeFundFees();
        Proposal memory proposalToAccept = proposals[proposalIdToAccept];
        require(proposalToAccept.approvalTimelockEnd != 0, "This proposal isn't active or was never issued an intentToAccept");
        require(block.timestamp > proposalToAccept.approvalTimelockEnd, "The timelock for this proposal has not ended");
        amountOut = s_IFundToken.swapAsset(
            proposalToAccept.assetToTrade,
            proposalToAccept.assetToReceive,
            proposalToAccept.amountIn);

        for (uint256 i = 0; i < s_activeProposalIds.length; i++)
        {
            if (s_activeProposalIds[i] == proposalIdToAccept)
            {
                s_activeProposalIds[i] = s_activeProposalIds[s_activeProposalIds.length - 1];
                s_activeProposalIds.pop();
                break;
            }
        }

        delete proposals[proposalIdToAccept];

        // increment the number of accepted proposals for this epoch
        totalAcceptedProposals++;

        Proposer storage successfulProposer;
        int256 successfulProposerIndex = checkIsSuccessfulProposer(proposalToAccept.proposer);
        if (successfulProposerIndex == -1)
        {
            // If this is the proposers first accepted proposal of the epoch add them to successfulProposers
            successfulProposer = successfulProposers.push();
            successfulProposer.proposer = proposalToAccept.proposer;
        }
        else
        {
            // Get them from the list if they are already there
            successfulProposer = successfulProposers[uint256(successfulProposerIndex)];
        }
        successfulProposer.acceptedProposals.push(proposalToAccept);
        
        return amountOut;
    }
}
