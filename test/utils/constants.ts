// constants.ts
// used to hold constants for the test cases


interface MiscConstants
{
    ONE_HOUR: bigint;
    ONE_DAY: bigint;
    ZERO_ADDRESS: string;
}

export const miscConstants: MiscConstants =
{
    ONE_HOUR: 60n * 60n,
    ONE_DAY: 24n * 60n * 60n,
    ZERO_ADDRESS: "0x0000000000000000000000000000000000000000",
}

interface BlockchainNetworkConstants
{
    // the Addresses of the ERC20 tokens
    usdcAddress: string;
    wETHAddress:string;
    cbBTCAddress: string;

    // the Addresses of the Aggregators
    usdcAggregatorAddress: string;
    wETHAggregatorAddress: string;
    cbBTCAggregatorAddress: string;

    // the Addresses of the whales (users with a lot of these tokens)
    usdcWhaleAddress: string;
    wETHWhaleAddress: string;
    cbBTCWhaleAddress: string;

    uniswapRouterAddress: string;
}

export const baseMainnetConstants: BlockchainNetworkConstants =
{
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    wETHAddress: "0x4200000000000000000000000000000000000006",
    cbBTCAddress: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",

    usdcAggregatorAddress: "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B",
    // TODO: This is actually the ETH/USD aggregator, I couldn't find the wETH aggregator
    // We need to check if this will make a difference
    wETHAggregatorAddress: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
    cbBTCAggregatorAddress: "0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D",

    usdcWhaleAddress: "0x0B0A5886664376F59C351ba3f598C8A8B4D0A6f3",
    wETHWhaleAddress: "0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7",
    cbBTCWhaleAddress: "0xBdb9300b7CDE636d9cD4AFF00f6F009fFBBc8EE6",

    uniswapRouterAddress: "0x2626664c2603336E57B271c5C0b26F421741e481",
}

// interfaces for the ERC20s
interface MockERC20Constants
{
    name: string;
    symbol: string;
    totalSupply: bigint;
    decimals: bigint;
}

// Mock ERC20 token constants definitions
export const usdcMockConstants: MockERC20Constants =
{
    name: "USDC Mock",
    symbol: "USDM",
    totalSupply: 1000000000n,
    decimals: 6n,
}

export const wethMockConstants: MockERC20Constants =
{
    name: "WETH Mock",
    symbol: "WETM",
    decimals: 18n,
    totalSupply: 1000000000n,
}

export const cbBTCMockConstants: MockERC20Constants =
{
    name: "cbBTC Mock",
    symbol: "cbBTCM",
    decimals: 18n,
    totalSupply: 1000000000n,
}

// interface for the mock aggregators
interface MockAggregatorConstants
{
    decimals: bigint;
    initialAnswer: bigint;
}

// Mock Aggregator constants definitionss
export const usdcAggregatorMockConstants: MockAggregatorConstants =
{
    decimals: 8n,
    initialAnswer: 1n,
}

export const ethAggregatorMockConstants: MockAggregatorConstants =
{
    decimals: 8n,
    initialAnswer: 1800n,
}

export const wethAggregatorMockConstants: MockAggregatorConstants =
    ethAggregatorMockConstants;

export const cbBTCAggregatorMockConstants: MockAggregatorConstants =
{
    decimals: 8n,
    initialAnswer: 100n,
}

interface FundControllerConstants
{
    initialEpochTime: bigint;
    initialPercentageFeeProposers: bigint;
    initialPercentageFeeGovernors: bigint;
    initialMintingUnitConversion: bigint;
}

export const fundControllerConstants: FundControllerConstants =
{
    initialEpochTime: miscConstants.ONE_DAY,
    // NOTE: These fee values are reciprical!
    // 1% fee = 1/0.01 = 100
    initialPercentageFeeProposers: 100n,
    initialPercentageFeeGovernors: 100n,

    initialMintingUnitConversion: 100n
}
