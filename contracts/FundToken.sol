// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./interfaces/ISwapRouterExtended.sol";
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';

import "hardhat/console.sol";

struct asset
{
    IERC20 token;
    AggregatorV3Interface aggregator;
}

contract FundToken is ERC20, Ownable
{
    asset[] public s_supportedAssets;
    ISwapRouterExtended public immutable swapRouter;
    address controllerAddress;

    // NOTE: Here the owner of the token is the controller
    constructor(address _controllerAddress, address _baseTokenAddress,
                address _baseTokenAggregatorAddress, address _swapRouterAddress)
        ERC20("FundToken", "FUND") Ownable(_controllerAddress)
    {
        s_supportedAssets.push(asset(
            IERC20(_baseTokenAddress), AggregatorV3Interface(_baseTokenAggregatorAddress)));
        swapRouter = ISwapRouterExtended(_swapRouterAddress);
        controllerAddress = _controllerAddress;
        IERC20 baseToken = IERC20(_baseTokenAddress);
        baseToken.approve(_controllerAddress, type(uint256).max);

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
        IERC20 assetToAdd = IERC20(_assetAddress);
        assetToAdd.approve(controllerAddress, type(uint256).max);
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

    function swapAsset(address _assetToTrade, address _assetToGet, uint256 _amountIn) external onlyOwner
        returns (uint256 amountOut)
    {
        TransferHelper.safeApprove(_assetToTrade, address(swapRouter), _amountIn); 

        ISwapRouterExtended.ExactInputSingleUpdatedParams memory params =
            ISwapRouterExtended.ExactInputSingleUpdatedParams({
                tokenIn: _assetToTrade,
                tokenOut: _assetToGet,
                fee: 3000,
                recipient: address(this),
                // deadline: block.timestamp,
                amountIn: _amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
        amountOut = swapRouter.exactInputSingle(params);

        return amountOut;
    }
}
