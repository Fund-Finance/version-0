/** The Fund Token Smart Contract **/


/** This file follows the following format:
 * 1. pragma statement
 * 2. imports
 * 3. structs
 * 4. Contract
 *     a. public state variables
 *     b. constructor
 *     c. external functions
 **/

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/************** Imports ***************/

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "solady/src/utils/FixedPointMathLib.sol";
import "./interfaces/ISwapRouterExtended.sol";
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import "./interfaces/IERC20Extended.sol";
import "hardhat/console.sol";


/************** Structs ***************/

/// @title Asset
/// @notice Represents an asset in the fund token, including its token and price feed
struct Asset
{
    IERC20Extended token;
    AggregatorV3Interface aggregator;
}

/************** Contract ***************/

contract FundToken is ERC20, Ownable
{
    /************** Public State Variables ***************/

    Asset[] public s_supportedAssets;
    ISwapRouterExtended public immutable s_swapRouter;
    address public s_controllerAddress;

    /************** Constructor ***************/
    /// @notice Initializes the FundToken contract with the base token and its price feed
    /// @notice The base token is the first asset in the supported assets array
    /// @dev The Fund Controller is set the owner of this contract 
    /// @param _controllerAddress The address of the Fund Controller contract
    /// @param _baseTokenAddress The address of the base token (e.g., USDC)
    /// @param _baseTokenAggregatorAddress The address of the Chainlink price feed for the base token
    /// @param _swapRouterAddress The address of the Uniswap swap router
    constructor(address _controllerAddress, address _baseTokenAddress,
                address _baseTokenAggregatorAddress, address _swapRouterAddress)
        ERC20("FundToken", "FUND") Ownable(_controllerAddress)
    {
        s_supportedAssets.push(Asset(
            IERC20Extended(_baseTokenAddress), AggregatorV3Interface(_baseTokenAggregatorAddress)));
        s_swapRouter = ISwapRouterExtended(_swapRouterAddress);
        s_controllerAddress = _controllerAddress;
        IERC20 baseToken = IERC20(_baseTokenAddress);
        baseToken.approve(_controllerAddress, type(uint256).max);

    }

    /************** External Functions ***************/

    /// @notice Mints new tokens to the specified address
    /// @dev The Fund Controller is the only entity that can mint tokens
    /// @param _to The address to mint tokens to
    /// @param _amount The amount of tokens to mint
    function mint(address _to, uint256 _amount) external onlyOwner
    {
        _mint(_to, _amount);
    }

    /// @notice Burns tokens from the specified address
    /// @dev The Fund Controller is the only entity that can burn tokens
    /// @param _from The address to burn tokens from
    /// @param _amount The amount of tokens to burn
    function burn(address _from, uint256 _amount) external onlyOwner
    {
        _burn(_from, _amount);
    }

    /// @notice Adds a new asset to the fund token
    /// @dev The Fund Controller is the only entity that can add assets
    /// @param _assetAddress The address of the asset token to add
    /// @param _aggregatorAddress The address of the Chainlink price feed for the asset
    function addAsset(address _assetAddress, address _aggregatorAddress) external onlyOwner
    {
        IERC20 assetToAdd = IERC20(_assetAddress);
        assetToAdd.approve(s_controllerAddress, type(uint256).max);
        s_supportedAssets.push(Asset(IERC20Extended(_assetAddress), AggregatorV3Interface(_aggregatorAddress)));
    }

    /// @notice Gets the total value of the fund token in USD by summing the value of each asset in the fund token
    /// @dev This is accomplished using the Chainlink price feeds for each asset
    /// @return totalValue The total value of the fund token in USD, in fixed-point (1e18) format
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

    /// @notice Gets the list of supported assets in the fund token
    /// @return An array of Asset structs representing the supported assets
    function getAssets() external view returns (Asset[] memory)
    {
        return s_supportedAssets;
    }

    /// @notice Swaps an asset in the fund token for another asset using the Uniswap swap router
    /// @dev The Fund Controller is the only entity that can swap assets
    /// @param _assetToTrade The address of the asset to trade (e.g., USDC)
    /// @param _assetToGet The address of the asset to get (e.g., WETH)
    /// @param _amountIn The amount of the asset to trade
    /// @return amountOut The amount of the asset received from the swap
    function swapAsset(address _assetToTrade, address _assetToGet, uint256 _amountIn) external onlyOwner
        returns (uint256 amountOut)
    {
        TransferHelper.safeApprove(_assetToTrade, address(s_swapRouter), _amountIn); 

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
        amountOut = s_swapRouter.exactInputSingle(params);

        return amountOut;
    }
}
