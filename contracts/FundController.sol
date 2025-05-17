// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
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
}

struct Proposer
{
    address proposer;
    Proposal[] acceptedProposals;
}

contract FundController is Ownable
{
    uint256 public s_epochTime;
    uint256 public s_epochExpirationTime;

    // NOTE: These percentage values are reciprical
    // meaning 1% would be 1/0.01 = 100
    uint256 public s_proposalPercentageReward;
    uint256 public s_governorPercentageReward;

    uint256 constant public initialMintingRate = 10 ** 2;

    uint256 public s_minToMint;

    uint256[] public s_activeProposalIds;

    uint256 public totalAcceptedProposals;
    // mapping of proposalId to the the proposal
    mapping(uint256 => Proposal) public proposals;
    
    Proposer[] public successfulProposers;

    address[] public governors;

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
        s_epochTime = _initialEpochTime;
        s_proposalPercentageReward = _initialProposalPercentageReward;
        s_governorPercentageReward = _initialGovernorPercentageReward;
        s_IUSDC = IERC20Extended(_usdcAddress);
        usdcAggregator = AggregatorV3Interface(usdcAggregatorAddress);

        // Register the owner as the first governor
        // Ownable can only have 1 owner at a given time
        // Currently this means that the only way to accrue governors is to trasnfer
        // ownership and then have them call registerGovernor()
        // TODO: think about how we want to manage multiple governors
        // - Probably should use Openzepplin Roles instead/in addition to Ownable
        governors.push(msg.sender);
    }

    function initialize(address _fundTokenAddress) external
    {
        s_IFundToken = IFundToken(_fundTokenAddress);
        s_minToMint = 2 * 10 ** s_IFundToken.decimals() / initialMintingRate;
        latestProposalId = 1;
        s_epochExpirationTime = block.timestamp + s_epochTime;
    }

    // setter functions for how the protocol opperates
    function setEpochTime(uint256 _epochTime) external onlyOwner
    { s_epochTime = _epochTime; }

    function setProposalPercentageReward(uint256 _percentage) external onlyOwner
    { s_proposalPercentageReward = _percentage; }

    function setGovernorPercentageReward(uint256 _percentage) external onlyOwner
    { s_governorPercentageReward = _percentage; }

    function issueUsingStableCoin(uint256 _rawAmount) external
    {
        realizeFundFees();
        uint256 allowance = s_IUSDC.allowance(msg.sender, address(this));
        require(allowance >= _rawAmount, "You must approve the contract to spend your USDC");
        (, int256 dollarToUSDC, , ,) = usdcAggregator.latestRoundData();
        uint256 dollarAmount = _rawAmount * uint256(dollarToUSDC) / 10 ** usdcAggregator.decimals();

        // this initial rate makes 1fToken = $100
        uint256 unitConversionInitial = (10 ** (s_IFundToken.decimals() - s_IUSDC.decimals())) / initialMintingRate;
        uint256 amountToMint;

        // if this is the first time the fund token is being minted
        // base it off of the dollar amount such that 1 fund token = $100
        if (s_IFundToken.totalSupply() == 0)
        {
            amountToMint = dollarAmount * unitConversionInitial;
        }
        // it is based on the total value
        else
        {
            amountToMint = (dollarAmount * s_IFundToken.totalSupply()) / s_IFundToken.getTotalValueOfFund();

        }
        require(amountToMint > s_minToMint, "You must mint more than the minimum amount");

        // then perform the transfer from function
        s_IUSDC.transferFrom(msg.sender, address(s_IFundToken), _rawAmount);

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
            uint256 amountToRedeem = _rawFTokenToRedeem * assetToRedeem.balanceOf(address(s_IFundToken)) / s_IFundToken.totalSupply();
            // transfer the asset to the user
            assetToRedeem.transferFrom(address(s_IFundToken), msg.sender, amountToRedeem);
        }
        // TODO: look into re-entry attack, should we burn before distributing the assets?
        // burn the fund tokens
        s_IFundToken.burn(msg.sender, _rawFTokenToRedeem);
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

            uint256 rewardForProposer = (totalSupply * acceptedProposalCount) / (s_proposalPercentageReward * totalAcceptedProposals);

            // pay the proposer their reward
            s_IFundToken.mint(proposer.proposer, rewardForProposer);
        }
        delete successfulProposers;
        totalAcceptedProposals = 0;

        // payout Governors for all elapsed epochs since last payout
        for (uint256 i = 0; i < governors.length; i++)
        {
            address governor = governors[i];
            uint256 rewardForGovernor = ((totalSupply / s_governorPercentageReward) * elapsedEpochs) / governors.length;

            s_IFundToken.mint(governor, rewardForGovernor);
        }
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
            s_epochExpirationTime += s_epochTime;
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
            _amountIn);
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

    function acceptProposal(uint256 proposalIdToAccept) external onlyOwner
        returns (uint256 amountOut)
    {
        realizeFundFees();
        Proposal memory proposalToAccept = proposals[proposalIdToAccept];
        amountOut = s_IFundToken.swapAsset(
            proposalToAccept.assetToTrade,
            proposalToAccept.assetToReceive,
            proposalToAccept.amountIn);

        for (uint256 i = 0; i < s_activeProposalIds.length; i++)
        {
            if (s_activeProposalIds[i] == proposalIdToAccept)
            {
                delete s_activeProposalIds[i];
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
    function registerGovernor() external onlyOwner
    {
        for (uint256 i = 0; i < governors.length; i++)
        {
            if (msg.sender == governors[i])
            {
                return;
            }
        }
        governors.push(msg.sender);
    }
}
