// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

struct asset
{
    IERC20 tokenInterface;
    AggregatorV3Interface aggregatorInterface;
}

contract FundToken is ERC20, Ownable
{
    asset[] public s_supportedAssets;
    address public s_controllerAddress;

    // NOTE: Here the owner of the token is the controller
    constructor(address _controllerAddress)
        ERC20("FundToken", "FUND") Ownable(_controllerAddress)
    {}

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
            ) = s_supportedAssets[i].aggregatorInterface.latestRoundData();
            totalValue += uint256(answer) * s_supportedAssets[i].tokenInterface.balanceOf(address(this));

        }
        return totalValue;
    }

}
