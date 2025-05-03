// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IERC20Extended.sol";
import "./interfaces/IFundToken.sol";

contract FundController is Ownable
{
    uint256 public s_epochTime;
    uint256 public s_proposalPercentageReward;
    uint256 public s_governorPercentrageReward;
    uint256 public s_minToMint;

    IERC20Extended public s_IUSDC;
    IFundToken public s_IFundToken;

    constructor(uint256 _initialEpochTime,
               uint256 _initialProposalPercentageReward,
               uint256 _initialGovernorPercentageReward,
               address _usdcAddress)
               Ownable(msg.sender)
    {
        s_epochTime = _initialEpochTime;
        s_proposalPercentageReward = _initialProposalPercentageReward;
        s_governorPercentrageReward = _initialGovernorPercentageReward;
        s_IUSDC = IERC20Extended(_usdcAddress);

    }

    function initialize(address _fundTokenAddress) external
    {
        s_IFundToken = IFundToken(_fundTokenAddress);
        s_minToMint = 2 * 10 ** s_IFundToken.decimals();
    }

    // setter functions for how the protocol opperates
    function setEpochTime(uint256 _epochTime) external onlyOwner
    { s_epochTime = _epochTime; }

    function setProposalPercentageReward(uint256 _percentage) external onlyOwner
    { s_proposalPercentageReward = _percentage; }

    function setGovernorPercentageReward(uint256 _percentage) external onlyOwner
    { s_governorPercentrageReward = _percentage; }

    function issueStableCoin(address _to, uint256 _rawAmount) external onlyOwner
    {
        uint256 allowance = s_IUSDC.allowance(_to, address(this));
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
            uint256 totalValue = _getTotalValueOfFund();
            rate = totalValue / s_IFundToken.totalSupply();
        }
        uint256 amountToMint = _rawAmount * unitConversion * rate;
        require(amountToMint > s_minToMint, "You must mint more than the minimum amount");

        // check allowance

        // then perform the transfer from function


        s_IFundToken.mint(_to, amountToMint);
    }


    function _getTotalValueOfFund() internal view returns (uint256)
    {
        uint256 totalValue = 0;
        address[] memory assets = s_IFundToken.s_assets();
        for (uint256 i = 0; i < assets.length; i++)
        {
            totalValue += IERC20(assets[i]).balanceOf(address(this));
        }
        return totalValue;
    }

}
