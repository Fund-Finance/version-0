import hre from "hardhat";

import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import FundFinanceModule  from "../ignition/modules/FundFinanceContracts";
import { contractDeploymentForkedFixture } from "../test/utils/fixtures";
import { baseMainnetConstants } from "../test/utils/constants";


async function main() {
    const { fundController, fundToken } = await hre.ignition.deploy(FundFinanceModule);
    
    console.log("FundController deployed at:", await fundController.getAddress());
    console.log("FundToken deployed at:", await fundToken.getAddress());


    const { owner, addr1, cbBTC, wETH, usdc, usdcAggregator } = await loadFixture(contractDeploymentForkedFixture);

    const amountToApprove_usdc = 100_000_000n; // 100 million USDC

    const amountToSpend_usdc = 200_000n;

    // mint
    await usdc.connect(owner).approve(await fundController.getAddress(),
        amountToApprove_usdc * 10n ** await usdc.decimals());
        
    await fundController.connect(owner).
        issueUsingStableCoin(amountToSpend_usdc * 10n ** await usdc.decimals());

    console.log("Usdc that the fund has: ", await usdc.balanceOf(await fundToken.getAddress()));

    console.log("FundToken total supply: ", await fundToken.totalSupply());
    console.log("FundToken balance of owner: ", await fundToken.balanceOf(await owner.getAddress()));
    console.log("Total value of fund: ", await fundToken.getTotalValueOfFund());

    // add the assets to the fund:

    await fundController.addAssetToFund(await wETH.getAddress(), baseMainnetConstants.wETHAggregatorAddress);
    await fundController.addAssetToFund(await cbBTC.getAddress(), baseMainnetConstants.cbBTCAggregatorAddress);

    const amountToSpendProposal1_usdc = 2_000n;
    await fundController.connect(addr1).createProposal(await usdc.getAddress(), await wETH.getAddress(), amountToSpendProposal1_usdc * 10n ** await usdc.decimals());

    const amountToSpendProposal2_usdc = 100_000n;
    await fundController.connect(addr1).createProposal(await usdc.getAddress(), await cbBTC.getAddress(), amountToSpendProposal2_usdc * 10n ** await usdc.decimals());


    await fundController.connect(owner).acceptProposal(1n);
    console.log("Total value of fund: ", await fundToken.getTotalValueOfFund());
    await fundController.connect(owner).acceptProposal(2n);
    console.log("Total value of fund: ", await fundToken.getTotalValueOfFund());

    const usdcRealBalance = Number(await usdc.balanceOf(await fundToken.getAddress())) / Number(10n ** await usdc.decimals());
    const wETHRealBalance = Number(await wETH.balanceOf(await fundToken.getAddress())) / Number(10n ** await wETH.decimals());
    const cbBTCRealBalance = Number(await cbBTC.balanceOf(await fundToken.getAddress())) / Number(10n ** await cbBTC.decimals());

    console.log("Usdc that the fund has after proposals: ", usdcRealBalance);
    console.log("wETH balance of the fund: ", wETHRealBalance);
    console.log("cbBTC balance of the fund: ", cbBTCRealBalance);

    console.log("The owner has usdc: ", Number(await usdc.balanceOf(await owner.getAddress())) / Number(10n ** await usdc.decimals()));

    console.log("owner address: ", await owner.getAddress());

    // the total value of the fund decreases with each trade due to fees
    console.log("Total value of fund: ", await fundToken.getTotalValueOfFund());

    console.log()
    console.log("USDC allowance for fund controller: ", await usdc.allowance(await owner.getAddress(), await fundController.getAddress()));

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

