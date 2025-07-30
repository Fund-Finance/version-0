// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IERC20Extended.sol";
import "../FundToken.sol";

interface IFundToken is IERC20Extended
{
    function mint(address _to, uint256 _amount) external;
    function burn(address _from, uint256 _amount) external;

    function s_supportedAssets() external view returns (Asset[] memory);
    function addAsset(address _assetAddress, address _aggregatorAddress) external;
    function getTotalValueOfFund() external view returns (uint256);
    function getValueOfAssetInFund(address _asset) external view returns (uint256);

    function getAssets() external view returns (Asset[] memory);

    function swapAsset(address _assetToTrade,
        address _assetToGet, uint256 _amountIn) external returns (uint256);
}
