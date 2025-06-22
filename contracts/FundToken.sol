// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "solady/src/utils/FixedPointMathLib.sol";
import "./interfaces/ISwapRouterExtended.sol";
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import "./interfaces/IERC20Extended.sol";
import "hardhat/console.sol";


// an asset contains an ERC20 token and a Chainlink price feed
struct asset
{
    IERC20Extended token;
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
            IERC20Extended(_baseTokenAddress), AggregatorV3Interface(_baseTokenAggregatorAddress)));
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
        s_supportedAssets.push(asset(IERC20Extended(_assetAddress), AggregatorV3Interface(_aggregatorAddress)));
    }

    // returns in fixed-point (1e18) format
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
            uint256 assetPrice = uint256(answer) * (10 ** (18 - s_supportedAssets[i].aggregator.decimals()));
            uint256 tokenPrice = s_supportedAssets[i].token.balanceOf(address(this))
                * (10 ** (18 - s_supportedAssets[i].token.decimals()));
            totalValue += FixedPointMathLib.mulWad(assetPrice, tokenPrice);
        }
        return totalValue;
    }

    // TODO: come up with a better way of writting this function
    function getValueOfAssetInFund(address _asset) external view returns (uint256)
    {
        for(uint256 i = 0; i < s_supportedAssets.length; i++)
        {
            if(address(s_supportedAssets[i].token) == _asset)
            {
                (,
                 int256 answer,
                ,
                ,
                ) = s_supportedAssets[i].aggregator.latestRoundData();
                uint256 assetPrice = uint256(answer) * (10 ** (18 - s_supportedAssets[i].aggregator.decimals()));
                uint256 tokenPrice = s_supportedAssets[i].token.balanceOf(address(this))
                    * (10 ** (18 - s_supportedAssets[i].token.decimals()));
                return FixedPointMathLib.mulWad(assetPrice, tokenPrice);

            }
        }

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
