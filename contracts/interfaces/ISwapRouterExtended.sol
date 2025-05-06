// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

interface ISwapRouterExtended is ISwapRouter
{
    function factory() external view returns (address);
}
