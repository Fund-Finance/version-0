// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

interface ISwapRouterExtended is ISwapRouter
{
    function factory() external view returns (address);

    // for whatever reason, the uniswap
    // router no longer uses the deadline
    // like the documentation says
    struct ExactInputSingleUpdatedParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        // uint256 deadline
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Swaps `amountIn` of one token for as much as possible of another token
    /// @param params The parameters necessary for the swap, encoded as `ExactInputSingleParams` in calldata
    /// @return amountOut The amount of the received token
    function exactInputSingle(ExactInputSingleUpdatedParams calldata params)
        external payable returns (uint256 amountOut);
}
