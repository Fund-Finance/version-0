// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";


const initialEpochTime = 60n * 60n * 24n; // one day
const initialProposalPercentageReward = 10n ** 16n; // 1%
const initialGovernorPercentageReward = 10n ** 16n; // 1%
const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const usdcAggregatorAddress = "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B";
const uniswapRouterAddress = "0x2626664c2603336E57B271c5C0b26F421741e481";

const FundFinanceModule = buildModule("FundFinanceModule", (m) => {

  const fundController = m.contract("FundController", [initialEpochTime, initialProposalPercentageReward,
                                initialGovernorPercentageReward, usdcAddress,
                                usdcAggregatorAddress]);
  const fundToken = m.contract("FundToken", [fundController, usdcAddress,
  usdcAggregatorAddress, uniswapRouterAddress]);; 

  return { fundController, fundToken };
});

export default FundFinanceModule;
