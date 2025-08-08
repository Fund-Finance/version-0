/** The Fund Controller Smart Contract **/


/** This file follows the following format:
 * 1. pragma statement
 * 2. imports
 * 3. structs
 * 4. Contract
 *     a. public state variables
 *     b. private state variables
 *     c. events
 *     d. constructor
 *     e. modifiers
 *     f. external functions
 *     g. public functions
 *     h. internal functions
 *     i. private functions
 **/

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/************** Imports ***************/

import "@openzeppelin/contracts/access/Ownable.sol";
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import "solady/src/utils/FixedPointMathLib.sol";
import "./interfaces/IERC20Extended.sol";
import "./interfaces/IFundToken.sol";
import "./FundToken.sol";
import "./interfaces/ISwapRouterExtended.sol";

import "hardhat/console.sol";

/************** Structs ***************/

/// @title Proposal
/// @notice Used to store all necessary data for a valid trade proposal
struct Proposal
{
    uint256 id;
    address proposer;
    address[] assetsToTrade;
    address[] assetsToReceive;
    uint256[] amountsIn;
    uint256[] minAmountsToReceive;
    // Will be 0 until intentToAccept is called by the governor
    uint256 approvalTimelockEnd;
}

/// @title Proposer
/// @notice Used to store the proposer and their accepted proposals
struct Proposer
{
    address proposer;
    Proposal[] acceptedProposals;
}


/// @title Fee
/// @notice Used to store the current fee percentage and vlaues for transitioning to a new fee
/// @dev Percentages are defined in WAD (1e18): e.g., 1% = 0.01e18 = 1e16
struct Fee {
    uint256 feePercentage;
    uint256 newFeePercentage;
    uint256 newFeeTimeLockEnd;
}

/************** Contract ***************/

/// @title The Fund Controller Smart Contract
/// @author Nick Tremaroli & Max Calman
/// @notice This contract is used to manage the fund, including proposals, fees, and epoch management
/// @dev Designed to be a higher-level contract which calls the FundToken contract
contract FundController is Ownable
{
    /************** Public State Variables ***************/

    // This value is used to determine the amount of FundToken to mint
    // when the fund is empty. We will define it to be 1 FundToken = $100
    uint256 constant public s_initialFundTokenValue = 100e18;
    // the shortest an epoch can be is 1 day
    uint256 constant public s_shortestEpochDuration = 60 * 60 * 24;
    // the longest an epoch can be is 1 year
    uint256 constant public s_longestEpochDuration = 60 * 60 * 24 * 365;

    uint256 constant public s_largestFeePercentage = 2e16; // 2% in WAD (1e18)
    uint256 public s_epochDuration;
    uint256 public s_epochExpirationTime;
    // FOR NOW: Harcoding to 30 days
    uint256 public s_newFeeTimelockDuration = 60 * 60 * 24 * 30;
    // FOR NOW: Harcoding to 1 day for now, but could make settable like epoch duration
    // Although, unlike epoch duration we should not let governors change it
    uint256 public s_proposalAcceptTimelockDuration = 60 * 60 * 24;
    uint256[] public s_activeProposalIds;
    uint256 public s_totalAcceptedProposals;
    uint256 public s_latestProposalId;

    // mapping of proposalId to the the proposal
    mapping(uint256 => Proposal) public s_proposals;

    address[] public s_approvers;

    Fee public s_proposerPercentageReward;
    Fee public s_approverPercentageReward;

    Proposer[] public s_successfulProposers;

    /************** Private State Variables ***************/

    IERC20Extended private s_IUSDC;
    AggregatorV3Interface private usdcAggregator;
    IFundToken private s_IFundToken;

    /************** Events ***************/

    /// @notice Emitted when a new proposal is created
    /// @param proposalId The ID of the newly created proposal
    /// @param proposer The address of the proposer who created the proposal
    event ProposalCreated(uint256 indexed proposalId, address indexed proposer);

    /************** Constructor ***************/


    /// @notice Initializes the contract with initial values and sets the owner to the deployer
    /// @param _initialEpochTime The initial duration of an epoch in seconds
    /// @param _initialproposerPercentageReward The initial proposer fee percentage in WAD (1e18)
    /// @param _initialApproverPercentageReward The initial approver fee percentage in WAD (1e18)
    /// @param _usdcAddress The address of the USDC token contract
    /// @param usdcAggregatorAddress The address of the USDC price aggregator contract
    constructor(uint256 _initialEpochTime,
               uint256 _initialproposerPercentageReward,
               uint256 _initialApproverPercentageReward,
               address _usdcAddress, address usdcAggregatorAddress)
               Ownable(msg.sender)
    {
        s_epochDuration = _initialEpochTime;

        s_proposerPercentageReward.feePercentage = _initialproposerPercentageReward;
        s_approverPercentageReward.feePercentage = _initialApproverPercentageReward;

        s_IUSDC = IERC20Extended(_usdcAddress);
        usdcAggregator = AggregatorV3Interface(usdcAggregatorAddress);
        // TODO: Remove this
        s_approvers.push(msg.sender); // Add the contract deployer as an approver
    }

    /************** Modifiers ***************/

    /// @notice Modifier to restrict access to only the proposal approvers
    modifier onlyApprover()
    {
        bool allowed = false;
        for (uint i = 0; i < s_approvers.length; i++) {
            if (msg.sender == s_approvers[i])
            {
                allowed = true;
                break;
            }
        }
        require(allowed, "Sender is not an approver");
        _;
    }

    /************** External Functions ***************/

    /// @notice Initializes the contract with the FundToken address
    /// @dev This function must be called before any other functions can be used
    /// @dev sets the initial proposal ID starts the first epoch
    /// @param _fundTokenAddress The address of the FundToken contract
    function initialize(address _fundTokenAddress) external
    {
        s_IFundToken = IFundToken(_fundTokenAddress);
        s_latestProposalId = 1;
        s_epochExpirationTime = block.timestamp + s_epochDuration;
    }

    /// @notice Sets the list of approvers for the fund
    /// @dev This function can only be called by the owner of the contract
    /// @param _newApprovers The new list of approvers to set
    function setApproversList(address[] memory _newApprovers) external onlyOwner
    {
        s_approvers = _newApprovers;
    }

    /// @notice Sets the duration of the timelock for accepting a proposal
    /// @dev This function can only be called by the owner of the contract
    /// @param _proposalAcceptTimelockDuration The new duration of the timelock in seconds
    function setProposalAcceptTimelockDuration(uint256 _proposalAcceptTimelockDuration) external onlyOwner
    {
        s_proposalAcceptTimelockDuration = _proposalAcceptTimelockDuration;
    }

    /// @notice Sets the duration of an epoch
    /// @dev This function can only be called by the owner of the contract
    /// @dev The epoch duration must be between 1 day and 1 year otherwise it will revert
    /// @param _epochDuration The new duration of an epoch in seconds
    function setEpochDuration(uint256 _epochDuration) external onlyOwner
    {
        require(_epochDuration >= s_shortestEpochDuration &&
                _epochDuration <= s_longestEpochDuration,
               "Epoch duration must be between 1 day and 1 year");
        s_epochDuration = _epochDuration;
    }

    /// @notice Queues a new fee change and sets the timelock duration for changing fee percentages
    /// @dev This function can only be called by the owner of the contract
    /// @param _proposerPercentage The new proposer fee percentage in WAD (1e18)
    /// @param _approverPercentage The new approver fee percentage in WAD (1e18)
    function setFeePercentagesWad(uint256 _proposerPercentage, uint256 _approverPercentage) external onlyOwner
    {
        require(_approverPercentage + _proposerPercentage <= s_largestFeePercentage, "Total fund fees cannot exceed 2%");

        s_proposerPercentageReward.newFeePercentage = _proposerPercentage;
        s_proposerPercentageReward.newFeeTimeLockEnd = block.timestamp + s_newFeeTimelockDuration;
        
        s_approverPercentageReward.newFeePercentage = _approverPercentage;
        s_approverPercentageReward.newFeeTimeLockEnd = block.timestamp + s_newFeeTimelockDuration;
    }

    /// @notice Issues new FundTokens to the user based on the amount of USDC contributed
    /// @dev USDC is assumed to be in 6 decimal format, so we convert it to WAD (1e18) format
    /// @dev The USDC contribution is distributed proportionally across the fund's existing assets
    /// @param _rawUSDCContributed The raw amount of USDC contributed by the user in 10^6 format
    function issueUsingStableCoin(uint256 _rawUSDCContributed) external
    {
        realizeFundFees();
        uint256 allowance = s_IUSDC.allowance(msg.sender, address(this));
        require(allowance >= _rawUSDCContributed, "You must approve the contract to spend your USDC");

        uint256 usdcContributedInWAD = _rawUSDCContributed * 10 ** (18 - s_IUSDC.decimals());

        // NOTE: mulWad rounds down
        uint256 dollarValue = FixedPointMathLib.mulWad(usdcContributedInWAD, getUsdcPrice());

        // this initial rate makes 1fToken = $100
        uint256 amountToMint;

        // if this is the first time the fund token is being minted
        // base it off of the dollar amount such that 1 fund token = $100
        if (s_IFundToken.totalSupply() == 0)
        {
            amountToMint = FixedPointMathLib.divWad(dollarValue, s_initialFundTokenValue);
            // For first contribution, just add USDC to the fund
            s_IUSDC.transferFrom(msg.sender, address(s_IFundToken), _rawUSDCContributed);
        }
        // otherwise distribute the contribution proportionally across existing assets
        else
        {
            // Get current fund assets and their values
            Asset[] memory fundAssets = s_IFundToken.getAssets();
            uint256 totalFundValueBeforeInvestment = s_IFundToken.getTotalValueOfFund();
            
            // Transfer USDC to the fund first
            s_IUSDC.transferFrom(msg.sender, address(s_IFundToken), _rawUSDCContributed);
            
            // Distribute the contribution proportionally across all assets except USDC
            // Skip USDC (first asset) as we don't want to swap USDC for USDC
            for (uint256 i = 1; i < fundAssets.length; i++)
            {
                // Get the current value of this asset in the fund
                uint256 assetValue = s_IFundToken.getValueOfAssetInFund(address(fundAssets[i].token));
                
                // Calculate what proportion of the contribution should go to this asset
                uint256 proportionOfContribution = FixedPointMathLib.divWad(
                    FixedPointMathLib.mulWad(dollarValue, assetValue),
                    totalFundValueBeforeInvestment
                );
                
                // Convert the dollar proportion back to USDC amount
                uint256 usdcAmountForAsset = FixedPointMathLib.divWad(
                    proportionOfContribution,
                    getUsdcPrice()
                );
                
                // Convert from WAD back to USDC decimals
                uint256 usdcAmountInAssetDecimals = usdcAmountForAsset / 10 ** (18 - s_IUSDC.decimals());
                
                // Only swap if there's a meaningful amount to swap
                if (usdcAmountInAssetDecimals > 0)
                {
                    // Swap USDC for this asset
                    // TODO: Add a minimum to receive
                    s_IFundToken.swapAsset(
                        address(s_IUSDC),
                        address(fundAssets[i].token),
                        usdcAmountInAssetDecimals,
                        0
                    );
                }
            }
            
            // Calculate the amount of FundTokens to mint based on the total value
            amountToMint = FixedPointMathLib.divWad(FixedPointMathLib.mulWad(dollarValue,
                                                s_IFundToken.totalSupply()), totalFundValueBeforeInvestment);
        }

        s_IFundToken.mint(msg.sender, amountToMint);
    }

    /// @notice Redeems the user's FundTokens for USDC by selling their proportional share of the fund's assets
    /// @param _rawFTokenToRedeem The amount of FundTokens to redeem in WAD (1e18) format
    /// @return totalUsdcReceived The total amount of USDC received from selling the assets
    function redeemAssets(uint256 _rawFTokenToRedeem) external returns (uint256 totalUsdcReceived)
    {
        realizeFundFees();
        require(s_IFundToken.balanceOf(msg.sender) >= _rawFTokenToRedeem, "You do not have enough FUND tokens to redeem");
        
        totalUsdcReceived = 0;
        Asset[] memory fundAssets = s_IFundToken.getAssets();
        
        // Sell each asset for USDC and accumulate the total
        for (uint256 i = 0; i < fundAssets.length; i++)
        {
            IERC20 assetToRedeem = fundAssets[i].token;
            
            // Calculate the user's proportional share of this asset
            uint256 amountToRedeem = FixedPointMathLib.divWad(FixedPointMathLib.mulWad(
                _rawFTokenToRedeem, assetToRedeem.balanceOf(address(s_IFundToken))),
                s_IFundToken.totalSupply());
            
            // If this is USDC, just add it to the total
            if (address(assetToRedeem) == address(s_IUSDC))
            {
                totalUsdcReceived += amountToRedeem;
            }
            // Otherwise, swap the asset for USDC
            else if (amountToRedeem > 0)
            {
                // TODO: Add a minimum to receive
                uint256 usdcReceived = s_IFundToken.swapAsset(
                    address(assetToRedeem),
                    address(s_IUSDC),
                    amountToRedeem,
                    0
                );
                totalUsdcReceived += usdcReceived;
            }
        }
        
        // Transfer the total USDC to the user
        s_IUSDC.transferFrom(address(s_IFundToken), msg.sender, totalUsdcReceived);
        
        // Burn the fund tokens
        s_IFundToken.burn(msg.sender, _rawFTokenToRedeem);
        
        return totalUsdcReceived;
    }

    /// @notice Adds a new asset to the fund which can be traded
    /// @dev This function can only be called by the owner of the contract
    /// @param _assetAddress The address of the asset to add to the fund
    /// @param _aggregatorAddress The correspoinding address of the price aggregator for the asset
    function addAssetToFund(address _assetAddress, address _aggregatorAddress) external onlyOwner
    {
        s_IFundToken.addAsset(_assetAddress, _aggregatorAddress);
    }

    /// @notice Creates a new proposal for trading assets in the fund
    /// @param _assetsToTrade The address of the assets to trade
    /// @param _assetsToReceive The address of the assets to receive in return
    /// @param _amountsIn The amounts of each asset to trade in WAD (1e18) format
    /// @param _minAmountsToReceive The minimum amounts of each asset to receive in WAD (1e18) format
    /// @return proposalId The ID of the newly created proposal
    function createProposal(address[] memory _assetsToTrade,
                            address[] memory _assetsToReceive,
                            uint256[] memory _amountsIn,
                            uint256[] memory _minAmountsToReceive) external
                            returns (uint256 proposalId)
    {
        Proposal memory proposalToCreate = Proposal(
            s_latestProposalId,
            msg.sender,
            _assetsToTrade,
            _assetsToReceive,
            _amountsIn,
            _minAmountsToReceive,
            0);
        s_proposals[s_latestProposalId] = proposalToCreate;
        s_activeProposalIds.push(s_latestProposalId);
        emit ProposalCreated(s_latestProposalId, msg.sender);
        proposalId = s_latestProposalId;
        s_latestProposalId++;
        return proposalId;
    }

    /// @notice Issues an intent to accept a trade proposal, which starts a timelock for it
    /// @dev This function can only be called by the approvers of the fund
    /// @param proposalIdToAccept The ID of the proposal to accept
    function intentToAccept(uint256 proposalIdToAccept) external onlyApprover
    {
        Proposal storage proposalToAccept = s_proposals[proposalIdToAccept];
        proposalToAccept.approvalTimelockEnd = block.timestamp + s_proposalAcceptTimelockDuration;
    }

    /// @notice Accepts a trade proposal and executes the trade
    /// @dev This function can only be called by the approvers of the fund
    /// @dev This function can only be called once the timelock for the proposal has ended
    /// @param proposalIdToAccept The ID of the proposal to accept
    /// @return amountsOut The amount of the asset received in return for the trade
    function acceptProposal(uint256 proposalIdToAccept) external onlyApprover
        returns (uint256[] memory amountsOut)
    {
        realizeFundFees();
        Proposal memory proposalToAccept = s_proposals[proposalIdToAccept];

        require(proposalToAccept.approvalTimelockEnd != 0, "This proposal isn't active or was never issued an intentToAccept");
        require(block.timestamp > proposalToAccept.approvalTimelockEnd, "The timelock for this proposal has not ended");

        amountsOut = new uint256[](proposalToAccept.assetsToTrade.length);
        for(uint256 i = 0; i < proposalToAccept.assetsToTrade.length; i++)
        {
            amountsOut[i] = s_IFundToken.swapAsset(
                proposalToAccept.assetsToTrade[i],
                proposalToAccept.assetsToReceive[i],
                proposalToAccept.amountsIn[i],
                proposalToAccept.minAmountsToReceive[i]);
        }

        for (uint256 i = 0; i < s_activeProposalIds.length; i++)
        {
            if (s_activeProposalIds[i] == proposalIdToAccept)
            {
                s_activeProposalIds[i] = s_activeProposalIds[s_activeProposalIds.length - 1];
                s_activeProposalIds.pop();
                break;
            }
        }

        delete s_proposals[proposalIdToAccept];

        // increment the number of accepted proposals for this epoch
        s_totalAcceptedProposals++;

        // Attach this successful proposal to the proposer
        Proposer storage successfulProposer;
        int256 successfulProposerIndex = checkIsSuccessfulProposer(proposalToAccept.proposer);
        if (successfulProposerIndex == -1)
        {
            // If this is the proposers first accepted proposal of the epoch add them to successfulProposers
            successfulProposer = s_successfulProposers.push();
            successfulProposer.proposer = proposalToAccept.proposer;
        }
        else
        {
            // Get them from the list if they are already there
            successfulProposer = s_successfulProposers[uint256(successfulProposerIndex)];
        }
        successfulProposer.acceptedProposals.push(proposalToAccept);
        
        return amountsOut;
    }

    /// @notice Rejects a trade proposal and removes it from the active proposals list
    /// @dev This function can only be called by the approvers of the fund
    /// @param proposalIdToReject The ID of the proposal to reject
    function rejectProposal(uint256 proposalIdToReject) external onlyApprover
    {
        realizeFundFees();

        // Remove the proposal from the active proposals list
        for (uint256 i = 0; i < s_activeProposalIds.length; i++)
        {
            if (s_activeProposalIds[i] == proposalIdToReject)
            {
                s_activeProposalIds[i] = s_activeProposalIds[s_activeProposalIds.length - 1];
                s_activeProposalIds.pop();
                break;
            }
        }

        delete s_proposals[proposalIdToReject];
    }

    /// @notice Gets the list of active proposals
    /// @return activeProposals An array of active proposals
    function getActiveProposals() external view returns(Proposal[] memory activeProposals)
    {
        activeProposals = new Proposal[](s_activeProposalIds.length);
        for(uint256 i = 0; i < s_activeProposalIds.length; i++)
        {
            activeProposals[i] = s_proposals[s_activeProposalIds[i]];
        }
        return activeProposals;
    }

    /// @notice Gets the list of approvers for the fund
    /// @return An array of addresses representing the approvers
    function getApprovers() external view returns(address[] memory)
    {
        return s_approvers;
    }

    function getProposalById(uint256 id) external view returns(Proposal memory proposal)
    {
        console.log("Looking for Id: %s", id);
        for(uint256 i = 0; i < s_activeProposalIds.length; i++)
        {
            if (s_activeProposalIds[i] == id)
            {
                console.log("Found Id: %s", id);
                console.log("Proposals length: %s", s_activeProposalIds.length);
                proposal = s_proposals[s_activeProposalIds[i]];
                return proposal;
            }
        }
        console.log("Proposal with ID %s does not exist", id);
        revert("Proposal with the given ID does not exist");
    }

    /************** Public Functions ***************/

    /// @notice Checks if a proposer has been successful in the current epoch
    /// @param _proposer The address of the proposer to check
    /// @return index The index of the proposer in the successfulProposers array, or -1 if not found
    function checkIsSuccessfulProposer(address _proposer) public view returns (int256 index)
    {
        index = -1;
        for(uint256 i = 0; i < s_successfulProposers.length; i++)
        {
            if(s_successfulProposers[i].proposer == _proposer)
            {
                return int256(i);
            }
        }
        return index;
    }

    /// @notice Realizes the fund fees for all of the past epochs
    /// @notice Destributes the rewards from these fees to the proposers and approvers
    /// @dev This function is nested in every function that can change the investment state of the fund
    /// @dev This function is public so that users can call it to realize fees at any time
    function realizeFundFees() public
    {
        // if the epoch hasn't ended there are no payouts
        uint256 elapsedEpochs = elapsedEpochCount();
        if (elapsedEpochs == 0)
        {
            return;
        }

        // update fees
        if (block.timestamp >= s_proposerPercentageReward.newFeeTimeLockEnd)
        {
            s_proposerPercentageReward.feePercentage = s_proposerPercentageReward.newFeePercentage;
            s_proposerPercentageReward.newFeeTimeLockEnd = 0;

            // can be removed for optimzation, only included for readability
            s_proposerPercentageReward.newFeePercentage = 0;
        }
        if (block.timestamp >= s_approverPercentageReward.newFeeTimeLockEnd)
        {
            s_approverPercentageReward.feePercentage = s_approverPercentageReward.newFeePercentage;
            s_approverPercentageReward.newFeeTimeLockEnd = 0;

            // can be removed for optimzation, only included for readability
            s_approverPercentageReward.newFeePercentage = 0;
        }

        // all payouts should be based on the supply before the payouts for this epoch
        uint256 totalSupply = s_IFundToken.totalSupply();

        // payout Proposers
        // NOTE: if there are no successfulProposers, then no proposer fee is taken for that epoch
        // TODO: consider if this fee should instead go to the governors
        for(uint256 i = 0; i < s_successfulProposers.length; i++)
        {
            Proposer storage proposer = s_successfulProposers[i];

            // rewards are just based on the total number of accepted proposals
            uint256 acceptedProposalCount = proposer.acceptedProposals.length;

            // this needs to be Mul because the fee is in "decimal form" (meaning < 1e18)
            // so you need to do mulWad 
            uint256 rewardForProposer = FixedPointMathLib.mulWad(
                FixedPointMathLib.mulWad(totalSupply, acceptedProposalCount * 1e18),
                FixedPointMathLib.divWad(perEpochFeePercentage(s_proposerPercentageReward.feePercentage), s_totalAcceptedProposals * 1e18));

            // pay the proposer their reward
            s_IFundToken.mint(proposer.proposer, rewardForProposer);
        }
        delete s_successfulProposers;
        s_totalAcceptedProposals = 0;

        // payout Approvers
        uint256 rewardPerApprover = FixedPointMathLib.divWad(
            FixedPointMathLib.mulWad(totalSupply, s_approverPercentageReward.feePercentage),
            s_approvers.length);

        for(uint256 i = 0; i < s_approvers.length; i++)
        {
            // pay the Approver their reward
            s_IFundToken.mint(s_approvers[i], rewardPerApprover);
        }
    }

    /************** Internal Functions ***************/

    /// @notice Calculates the number of elapsed epochs since the last epoch expiration timei
    /// @notice Updates the epoch expiration time to the next epoch deadline
    /// @return elapsedEpochs The number of elapsed epochs since the last epoch expiration time
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

    /// @notice Gets the current USDC price in USD using the Chainlink price aggregator
    /// @return usdcPrice The normalized USDC/USD price in fixed-point (1e18) format
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

    /// @notice Computes the per-epoch fee percentage based on the annual fee percentage
    /// @notice Per Epoch Fee=(1 + Annual Fee)**(1/N) − 1, where N = epochsPerYear
    /// @param _annualFeePercentage The annual fee percentage in WAD (1e18) format
    /// @return perEpochFee The per-epoch fee percentage in WAD (1e18) format
    function perEpochFeePercentage(uint256 _annualFeePercentage) internal view returns (uint256)
    {
        // NOTE: not adjusted for years without exactly 365 days
        uint256 epochsPerYear = FixedPointMathLib.divWad(31_536_000 * 1e18, s_epochDuration * 1e18);

        // 1 / epochsPerYear
        uint256 exponent = FixedPointMathLib.divWad(1e18, epochsPerYear);

        // NOTE: powWad is an approximation according to docs
        uint256 growthFactor = uint256(FixedPointMathLib.powWad(int256(1e18 + _annualFeePercentage), int256(exponent)));

        // Subtract 1e18 to get just the fee
        return growthFactor - 1e18;
    }


}
