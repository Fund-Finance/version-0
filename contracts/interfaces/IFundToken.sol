// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IERC20Extended.sol";

interface IFundToken is IERC20Extended
{
    function mint(address _to, uint256 _amount) external;
    function burn(address _from, uint256 _amount) external;

    function s_assets() external view returns (address[] memory);
}
