/**
 * @file constants.ts
 * @description This file contains the constants used for 
 * testing the project.
 */

/**************** MISC CONSTANTS *******************/

// an interface used for Micellaneous constants
interface MiscConstants
{
    ONE_HOUR: bigint;
    ONE_DAY: bigint;
    ZERO_ADDRESS: string;
}

// Miscellaneous constants definitions for the test cases
export const miscConstants: MiscConstants =
{
    ONE_HOUR: 60n * 60n,
    ONE_DAY: 24n * 60n * 60n,
    ZERO_ADDRESS: "0x0000000000000000000000000000000000000000",
}

/**************** BLOCKCHAIN NETWORK CONSTANTS *******************/

// an interface used for the blockchain network constants
interface BlockchainNetworkConstants
{
    // the Addresses of the ERC20 tokens
    usdcAddress: string;
    wETHAddress:string;
    cbBTCAddress: string;
    linkAddress: string;
    aaveAddress: string;

    // the Addresses of the Aggregators
    usdcAggregatorAddress: string;
    wETHAggregatorAddress: string;
    cbBTCAggregatorAddress: string;
    linkAggregatorAddress: string;
    aaveAggregatorAddress: string;

    // the Addresses of the whales (users with a lot of these tokens)
    usdcWhaleAddress: string;
    wETHWhaleAddress: string;
    cbBTCWhaleAddress: string;

    uniswapRouterAddress: string;
}

// the base mainnet specific constants
export const baseMainnetConstants: BlockchainNetworkConstants =
{
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    wETHAddress: "0x4200000000000000000000000000000000000006",
    cbBTCAddress: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    linkAddress: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196",
    aaveAddress: "0x63706e401c06ac8513145b7687A14804d17f814b",

    usdcAggregatorAddress: "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B",
    // TODO: This is actually the ETH/USD aggregator, I couldn't find the wETH aggregator
    // We need to check if this will make a difference
    wETHAggregatorAddress: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
    cbBTCAggregatorAddress: "0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D",
    linkAggregatorAddress: "0x17CAb8FE31E32f08326e5E27412894e49B0f9D65",
    aaveAggregatorAddress: "0x3d6774EF702A10b20FCa8Ed40FC022f7E4938e07",

    usdcWhaleAddress: "0x0B0A5886664376F59C351ba3f598C8A8B4D0A6f3",
    wETHWhaleAddress: "0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7",
    cbBTCWhaleAddress: "0xBdb9300b7CDE636d9cD4AFF00f6F009fFBBc8EE6",

    uniswapRouterAddress: "0x2626664c2603336E57B271c5C0b26F421741e481",
}

/*************** MOCK ERC20 CONSTANTS ******************/

// interfaces for the ERC20s
interface MockERC20Constants
{
    name: string;
    symbol: string;
    totalSupply: bigint;
    decimals: bigint;
}

// The mock ERC20 constant definition of USDC
export const usdcMockConstants: MockERC20Constants =
{
    name: "USDC Mock",
    symbol: "USDM",
    totalSupply: 1000000000n,
    decimals: 6n,
}

// The mock ERC20 constant definition of wETH
export const wethMockConstants: MockERC20Constants =
{
    name: "WETH Mock",
    symbol: "wETM",
    decimals: 18n,
    totalSupply: 1000000000n,
}

// The mock ERC20 constant definition of cbBTC
export const cbBTCMockConstants: MockERC20Constants =
{
    name: "cbBTC Mock",
    symbol: "cbBTCM",
    decimals: 18n,
    totalSupply: 1000000000n,
}

/**************** MOCK AGGREGATOR CONSTANTS ******************/

// interface for the mock aggregators
interface MockAggregatorConstants
{
    decimals: bigint;
    initialAnswer: bigint;
}

// The mock aggregator constant definition of USDC/USD
export const usdcAggregatorMockConstants: MockAggregatorConstants =
{
    decimals: 8n,
    initialAnswer: 1n,
}

// The mock aggregator constant definition of ETH/USD
export const ethAggregatorMockConstants: MockAggregatorConstants =
{
    decimals: 8n,
    initialAnswer: 1800n,
}

// The mock aggregator constant definition of wETH/USD
export const wethAggregatorMockConstants: MockAggregatorConstants =
    ethAggregatorMockConstants;

// The mock aggregator constant definition of cbETH/USD
export const cbBTCAggregatorMockConstants: MockAggregatorConstants =
{
    decimals: 8n,
    initialAnswer: 100n,
}

/* ***************** CORE CONTRACT CONSTANTS ******************/

// The interface for the FundController constants
interface FundControllerConstants
{
    initialEpochTime: bigint;
    initialPercentageFeeProposers: bigint;
    initialPercentageFeeGovernors: bigint;
    initialMintingUnitConversion: bigint;
}

// The FundController constants definitions
export const fundControllerConstants: FundControllerConstants =
{
    initialEpochTime: miscConstants.ONE_DAY,
    // NOTE: These fee values are reciprical!
    // 1% fee = 1/0.01 = 100
    initialPercentageFeeProposers: 10n ** 16n,
    initialPercentageFeeGovernors: 10n ** 16n,

    initialMintingUnitConversion: 100n
}
