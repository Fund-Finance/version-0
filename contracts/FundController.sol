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
    uint256 epochDeadline;
}

struct SuccessfulProposer
{
    address proposer;
    Proposal[] acceptedProposals;
    // a mapping in which you put in the epoch
    // deadline and you get the number of proposals
    // that this user got accepted
    mapping(uint256 => uint256) proposalPerEpochDeadline;
}

struct ActiveGovernor
{
    address governor;
    // the proposals that the governor voted on
    Proposal[] votedProposals;

    // a mapping to see how many proposals the governor voted 
    // on in a given epoch
    mapping(uint256 => uint256) participationPerEpochDeadline;
}

contract FundController is Ownable
{
    uint256 public s_epochTime;
    uint256 public s_epochExpirationTime;

    // NOTE: These percentage values are reciprical
    // meaning 1% would be 1/0.01 = 100
    uint256 public s_proposalPercentageReward;
    uint256 public s_governorPercentrageReward;


    uint256 public s_minToMint;

    uint256[] public s_activeProposalIds;
    // mapping of epoch deadline to the number of acceptedProposals
    mapping(uint256 => uint256) public totalAcceptedProposalsPerEpoch;
    // mapping of proposalId to the the proposal
    mapping(uint256 => Proposal) public proposals;

    // mapping of the EPOCH deadline to the number of fund tokens
    mapping(uint256 => uint256) public totalFundTokenSupplyPerEpoch;
    
    mapping(address => SuccessfulProposer) public successfulProposers;
    address[] public successfulProposersList;

    // mapping of the epoch deadline to the governors that are active
    mapping(address => ActiveGovernor) public activeGovernors;
    address[] public participatingGovernorsList;

    uint256 latestProposalId;

    IERC20Extended private s_IUSDC;
    IFundToken private s_IFundToken;

    ISwapRouterExtended public immutable swapRouter;

    constructor(uint256 _initialEpochTime,
               uint256 _initialProposalPercentageReward,
               uint256 _initialGovernorPercentageReward,
               address _usdcAddress, address swapRounterAddress)
               Ownable(msg.sender)
    {
        s_epochTime = _initialEpochTime;
        s_proposalPercentageReward = _initialProposalPercentageReward;
        s_governorPercentrageReward = _initialGovernorPercentageReward;
        s_IUSDC = IERC20Extended(_usdcAddress);
        swapRouter = ISwapRouterExtended(swapRounterAddress);
    }

    function initialize(address _fundTokenAddress) external
    {
        s_IFundToken = IFundToken(_fundTokenAddress);
        s_minToMint = 2 * 10 ** s_IFundToken.decimals();
        latestProposalId = 1;
        s_epochExpirationTime = block.timestamp + s_epochTime;
    }

    // setter functions for how the protocol opperates
    function setEpochTime(uint256 _epochTime) external onlyOwner
    { s_epochTime = _epochTime; }

    function setProposalPercentageReward(uint256 _percentage) external onlyOwner
    { s_proposalPercentageReward = _percentage; }

    function setGovernorPercentageReward(uint256 _percentage) external onlyOwner
    { s_governorPercentrageReward = _percentage; }

    function issueStableCoin(uint256 _rawAmount) external onlyOwner
    {
        uint256 allowance = s_IUSDC.allowance(msg.sender, address(this));
        require(allowance >= _rawAmount, "You must approve the contract to spend your USDC");

        // TODO: Look over this math and make sure
        // there are not vulnerabilities
        uint256 unitConversion = 10 ** s_IFundToken.decimals() / 10 ** s_IUSDC.decimals();
        uint256 rate;
        // then have 1 USDC = 1 FUND
        if (s_IFundToken.totalSupply() == 0)
        {
            rate = 1;
        }
        // it is based on the total value
        else
        {
            // THE RATE WILL RUN INTO PROBLEMS IF
            // THE TOTAL VALUE IS < $1
            uint256 totalValue = s_IFundToken.getTotalValueOfFund();
            rate = totalValue / s_IFundToken.totalSupply();
        }
        uint256 amountToMint = _rawAmount * unitConversion * rate;
        require(amountToMint > s_minToMint, "You must mint more than the minimum amount");

        // check allowance

        // then perform the transfer from function
        s_IUSDC.transferFrom(msg.sender, address(s_IFundToken), _rawAmount);

        s_IFundToken.mint(msg.sender, amountToMint);

        if(getNextEpochDeadline())
        {
            payoutProposers();
            payoutGovernors();
            // if there is a new epoch set the to the total supply of the fund
            totalFundTokenSupplyPerEpoch[s_epochExpirationTime] = s_IFundToken.totalSupply();
        }
        totalFundTokenSupplyPerEpoch[s_epochExpirationTime] += amountToMint;
    }

    function redeemAssets(uint256 _rawFTokenToRedeem) public
    {
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

        if(getNextEpochDeadline())
        {
            payoutProposers();
            payoutGovernors();
            totalFundTokenSupplyPerEpoch[s_epochExpirationTime] = s_IFundToken.totalSupply();
        }
        totalFundTokenSupplyPerEpoch[s_epochExpirationTime] -= _rawFTokenToRedeem;

    }

    function payoutProposers() public
    {
        // iterate over all of the successful proposers
        for(uint256 i = 0; i < successfulProposersList.length; i++)
        {
            // for each of them get their accepted proposals
            uint256 totalRewardForProposer = 0;
            SuccessfulProposer storage proposer = successfulProposers[successfulProposersList[i]];
            Proposal[] memory proposersAcceptedProposals = proposer.acceptedProposals;
            // iterate over the accepted proposals and calculate the reward
            for(uint256 j = 0; j < proposersAcceptedProposals.length; j++)
            {
                Proposal memory proposal = proposersAcceptedProposals[j];
                // skip accepted proposals that are still in this epoch
                if (proposal.epochDeadline > block.timestamp || proposal.epochDeadline == 0)
                {
                    continue;
                }
                uint256 totalAccepted = totalAcceptedProposalsPerEpoch[proposal.epochDeadline];
                uint256 fundSizeAtEpoch = totalFundTokenSupplyPerEpoch[proposal.epochDeadline];
                uint256 rewardForProposal = (fundSizeAtEpoch / (s_proposalPercentageReward * totalAccepted));
                totalRewardForProposer += rewardForProposal;
                delete proposer.acceptedProposals[j];
            }
            // remove a successful proposer if all of his/her
            // accepted proposals have been paid out
            if (proposer.acceptedProposals.length == 0)
            {
                delete successfulProposers[successfulProposersList[i]];
                delete successfulProposersList[i];
            }
            // delete successfulProposers[successfulProposersList[i]];
            s_IFundToken.mint(proposer.proposer, totalRewardForProposer);
        }
        if (successfulProposersList.length == 0)
        {
            delete successfulProposersList;
        }
        
    }

    function payoutGovernors() public
    {
        for (uint256 i = 0; i < participatingGovernorsList.length; i++)
        {
            uint256 totalRewardForGovernor = 0;
            ActiveGovernor storage governor = activeGovernors[participatingGovernorsList[i]];
            Proposal[] memory governorsVotedProposals = governor.votedProposals;
            for (uint256 j = 0; j < governorsVotedProposals.length; j++)
            {
                Proposal memory proposal = governorsVotedProposals[j];
                // for now the governors will only be rewarded for the proposals they voted on
                // in the future they can be reward for doing other governance actions
                // if we decide to do so
                if (proposal.epochDeadline > block.timestamp || proposal.epochDeadline == 0)
                {
                    continue;
                }
                uint256 totalAccepted = totalAcceptedProposalsPerEpoch[proposal.epochDeadline];
                uint256 fundSizeAtEpoch = totalFundTokenSupplyPerEpoch[proposal.epochDeadline];
                uint256 rewardForGovernor = (fundSizeAtEpoch / (s_governorPercentrageReward * totalAccepted));
                totalRewardForGovernor += rewardForGovernor;
                delete governor.votedProposals[j];
            }
            // remove a governor if all of his/her
            // accepted proposals have been paid out
            if (governor.votedProposals.length == 0)
            {
                delete activeGovernors[participatingGovernorsList[i]];
                delete participatingGovernorsList[i];
            }
            s_IFundToken.mint(governor.governor, totalRewardForGovernor);
        }
        if (participatingGovernorsList.length == 0)
        {
            delete participatingGovernorsList;
        }
    }

    function addAssetToFund(address _assetAddress, address _aggregatorAddress) external onlyOwner
    {
        s_IFundToken.addAsset(_assetAddress, _aggregatorAddress);
    }

    // TODO: Remove this function, a swap should only happen through a proposal
    function swapAsset(address _assetToTrade, address _assetToGet, uint256 _amountIn) external onlyOwner
        returns (uint256 amountOut)
    {
        amountOut = s_IFundToken.swapAsset(_assetToTrade, _assetToGet, _amountIn);
        return amountOut;
    }

    function getNextEpochDeadline() public returns (bool newEpoch)
    {
        newEpoch = block.timestamp > s_epochExpirationTime;
        while (block.timestamp > s_epochExpirationTime)
        {
            s_epochExpirationTime += s_epochTime;
        }
        return newEpoch;
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

    function checkParticipatingGovernor(address _governor) public view returns (bool isParticipating)
    {
        for(uint256 i = 0; i < participatingGovernorsList.length; i++)
        {
            if(participatingGovernorsList[i] == _governor)
            {
                return true;
            }
        }
        return false;
    }

    function checkIsSuccessfulProposer(address _proposer) public view returns (bool isSuccessful)
    {
        for(uint256 i = 0; i < successfulProposersList.length; i++)
        {
            if(successfulProposersList[i] == _proposer)
            {
                return true;
            }
        }
        return false;
    }

    function acceptProposal(uint256 proposalIdToAccept) external onlyOwner
        returns (uint256 amountOut)
    {
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

        if(getNextEpochDeadline())
        {
            payoutProposers();
            payoutGovernors();
            totalFundTokenSupplyPerEpoch[s_epochExpirationTime] = s_IFundToken.totalSupply();
        }
        proposalToAccept.epochDeadline = s_epochExpirationTime;

        // increment the number of accepted proposals for this epoch
        totalAcceptedProposalsPerEpoch[proposalToAccept.epochDeadline]++;

        successfulProposers[proposalToAccept.proposer].proposer = proposalToAccept.proposer;
        successfulProposers[proposalToAccept.proposer].acceptedProposals.push(proposalToAccept);
        successfulProposers[proposalToAccept.proposer].proposalPerEpochDeadline[proposalToAccept.epochDeadline]++;

        if (!checkIsSuccessfulProposer(proposalToAccept.proposer))
        {
            successfulProposersList.push(proposalToAccept.proposer);
        }

        // add the governor to the list of active governors
        activeGovernors[msg.sender].governor = msg.sender;
        activeGovernors[msg.sender].votedProposals.push(proposalToAccept);
        activeGovernors[msg.sender].participationPerEpochDeadline[proposalToAccept.epochDeadline]++;

        if (!checkParticipatingGovernor(msg.sender))
        {
            participatingGovernorsList.push(msg.sender);
        }
        
        return amountOut;
    }

    function getCurrentBlockTimestamp() external view returns (uint256)
    {
        return block.timestamp;
    }
}
