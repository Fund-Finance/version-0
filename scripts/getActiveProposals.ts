
import hre from "hardhat";

import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import FundFinanceModule  from "../ignition/modules/FundFinanceContracts";
import { contractDeploymentForkedFixture } from "../test/utils/fixtures";
import { baseMainnetConstants } from "../test/utils/constants";


async function main() {
   const contractAddress = "0xFFb218E9664AA2998b8d3f8CE8c0577227e22C44";

  // Get the contract factory (for ABI and bytecode)
  const MyToken = await hre.ethers.getContractFactory("FundController");

  // Attach to the deployed contract
  const contract = MyToken.attach(contractAddress);

  // Now you can interact with the contract
  const activeProposals = await contract.getActiveProposals();

  console.log("Active Proposals:");
  console.log(activeProposals);

  // const proposalById = await contract.getProposalById(3);
  // console.log("Proposal By Id:");
  // console.log(proposalById);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

