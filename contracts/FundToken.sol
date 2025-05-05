// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

struct asset
{
    IERC20 token;
    AggregatorV3Interface aggregator;
}

contract FundToken is ERC20, Ownable
{
    asset[] public s_supportedAssets;

    // NOTE: Here the owner of the token is the controller
    constructor(address _controllerAddress, address _baseTokenAddress,
                address _baseTokenAggregatorAddress)
        ERC20("FundToken", "FUND") Ownable(_controllerAddress)
    {
        s_supportedAssets.push(asset(
            IERC20(_baseTokenAddress), AggregatorV3Interface(_baseTokenAggregatorAddress)));
    }

    function mint(address _to, uint256 _amount) external onlyOwner
    {
        _mint(_to, _amount);
    }

    function burn(address _from, uint256 _amount) external onlyOwner
    {
        _burn(_from, _amount);
    }

    function addAsset(address _assetAddress, address _aggregatorAddress) external onlyOwner
    {
        s_supportedAssets.push(asset(IERC20(_assetAddress), AggregatorV3Interface(_aggregatorAddress)));
    }

    function getTotalValueOfFund() external view returns (uint256)
    {
        uint256 totalValue = 0;
        for(uint256 i = 0; i < s_supportedAssets.length; i++)
        {
            (,
             int256 answer,
            ,
            ,
            ) = s_supportedAssets[i].aggregator.latestRoundData();
            totalValue += uint256(answer) * s_supportedAssets[i].token.balanceOf(address(this));

        }
        return totalValue;
    }

    function getAssets() external view returns (asset[] memory)
    {
        return s_supportedAssets;
    }
}
