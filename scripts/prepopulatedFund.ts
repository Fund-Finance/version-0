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


    const { owner, addr1, user, cbBTC, wETH, usdc, link, aave } = await loadFixture(contractDeploymentForkedFixture);



    const amountToApprove_usdc = 100_000_000n; // 100 million USDC

    const amountToSpend_usdc = 300_000n;

    // mint
    await usdc.connect(owner).approve(await fundController.getAddress(),
        amountToApprove_usdc * 10n ** await usdc.decimals());

    await usdc.connect(user).approve(await fundController.getAddress(),
        amountToApprove_usdc * 10n ** await usdc.decimals());

    await usdc.connect(addr1).approve(await fundController.getAddress(),
        amountToApprove_usdc * 10n ** await usdc.decimals());
        
    await fundController.connect(owner).
        issueUsingStableCoin(amountToSpend_usdc * 10n ** await usdc.decimals());

    console.log("Usdc that the fund has: ", await usdc.balanceOf(await fundToken.getAddress()));

    // console.log("FundToken total supply: ", await fundToken.totalSupply());
    // console.log("FundToken balance of owner: ", await fundToken.balanceOf(await owner.getAddress()));
    // console.log("Total value of fund: ", await fundToken.getTotalValueOfFund());

    // add the assets to the fund:

    const originalProposalAcceptTimelockDuration = await fundController.s_proposalAcceptTimelockDuration();

    await fundController.connect(owner).setProposalAcceptTimelockDuration(0n);

    await fundController.addAssetToFund(await wETH.getAddress(), baseMainnetConstants.wETHAggregatorAddress);
    await fundController.addAssetToFund(await cbBTC.getAddress(), baseMainnetConstants.cbBTCAggregatorAddress);
    await fundController.addAssetToFund(await aave.getAddress(), baseMainnetConstants.aaveAggregatorAddress);
    await fundController.addAssetToFund(await link.getAddress(), baseMainnetConstants.linkAggregatorAddress);

    const amountToSpendProposal1_usdc = 50_000n;
    let tx = await fundController.connect(addr1).createProposal([await usdc.getAddress()], [await wETH.getAddress()], [amountToSpendProposal1_usdc * 10n ** await usdc.decimals()], [0]);
    await tx.wait();

    const amountToSpendProposal2_usdc = 100_000n;
    tx = await fundController.connect(addr1).createProposal([await usdc.getAddress()], [await cbBTC.getAddress()], [amountToSpendProposal2_usdc * 10n ** await usdc.decimals()], [0]);
    await tx.wait();

    const amountToSpendProposal3_usdc = 2_000n;
    tx = await fundController.connect(addr1).createProposal([await usdc.getAddress()], [await link.getAddress()], [amountToSpendProposal3_usdc * 10n ** await usdc.decimals()], [0]);
    await tx.wait();

    const amountToSpendProposal4_usdc = 5_000n;
    tx = await fundController.connect(addr1).createProposal([await usdc.getAddress()], [await aave.getAddress()], [amountToSpendProposal4_usdc * 10n ** await usdc.decimals()], [0]);
    await tx.wait();

    const tx1 = await fundController.connect(owner).intentToAccept(1n);
    await tx1.wait();
    const tx2 = await fundController.connect(owner).intentToAccept(2n);
    await tx2.wait();
    const tx3 = await fundController.connect(owner).intentToAccept(3n);
    await tx3.wait();
    const tx4 = await fundController.connect(owner).intentToAccept(4n);
    await tx4.wait();

    const tx5 = await fundController.connect(owner).acceptProposal(1n);
    await tx5.wait();
    console.log("Total value of fund: ", await fundToken.getTotalValueOfFund());
    const tx6 = await fundController.connect(owner).acceptProposal(2n);
    await tx6.wait();
    console.log("Total value of fund: ", await fundToken.getTotalValueOfFund());
    const tx7 = await fundController.connect(owner).acceptProposal(3n);
    await tx7.wait();
    console.log("Total value of fund: ", await fundToken.getTotalValueOfFund());
    const tx8 = await fundController.connect(owner).acceptProposal(4n);
    await tx8.wait();
    console.log("Total value of fund: ", await fundToken.getTotalValueOfFund());
    
    await fundController.connect(owner).setProposalAcceptTimelockDuration(20n);

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
    console.log("Chainlink amount in fund: ", await link.balanceOf(await fundToken.getAddress()));

    console.log()
    console.log("USDC allowance for fund controller: ", await usdc.allowance(await owner.getAddress(), await fundController.getAddress()));

    console.log("USDC of user: ", await usdc.balanceOf(await user.getAddress()));
    console.log("Ether of user: ", await hre.ethers.provider.getBalance(await user.getAddress()));


}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

