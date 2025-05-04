// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MockV3Aggregator} from "@chainlink/local/src/data-feeds/MockV3Aggregator.sol";

contract FundMockAggregator is MockV3Aggregator
{
    constructor(uint8 _decimals, int256 _initialAnswer)
        MockV3Aggregator(_decimals, _initialAnswer)
        {}
}
