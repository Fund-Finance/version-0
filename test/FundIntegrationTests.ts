/** 
 * @file FundIntegrationTests.ts
 * @description This file contains the integration tests for the Fund contract.
 * These tests are meant to be run on a forked version of the the base mainnet
 * and are not meant to be run locally
 */

// at block 29878423 on base mainnet:
// eth price: ~$1800
// cbBTC price: ~$95,000

import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import network from "hardhat"

import { miscConstants, baseMainnetConstants,
wethAggregatorMockConstants, fundControllerConstants } from "./utils/constants";

import { contractDeploymentForkedFixture } from "./utils/fixtures";

import { mintFromStableCoin, addAssetToFund,
    createProposal, acceptProposal } from "./utils/foundationFunctions";

// the header for the fund integration tests
describe("Fund Integration Tests", function ()
{
    // tests related to minting when there are multiple assets
    // involved but the values of the assets don't change
    it("Should mint the fund token correctly: multiple tokens, stable value", async function ()
    {
        const latestBlock = await hre.ethers.provider.getBlock("latest");
        if(network.network.name !== "localhost" || latestBlock.number < 20000)
        {
            this.skip();
        }

        const { owner, addr1, fundToken, fundController,
            cbBTC, wETH, usdc, usdcAggregator } = await loadFixture(contractDeploymentForkedFixture);

        // mint the fund token
        const amountToSpend1_usdc = 100_000n;
        await mintFromStableCoin(usdc, usdcAggregator,
                                             owner, fundToken, fundController, amountToSpend1_usdc);

        // now add the wETH and cbBTC to the fund token
        await addAssetToFund(fundController, fundToken, await wETH.getAddress(),
                             baseMainnetConstants.wETHAggregatorAddress);
        await addAssetToFund(fundController, fundToken, await cbBTC.getAddress(),
                             baseMainnetConstants.cbBTCAggregatorAddress);

        // now we can make proposals to be accepted
        const amountToSpendProposal1_usdc = 2_000n;
        await createProposal(fundController, await usdc.getAddress(), await wETH.getAddress(),
            amountToSpendProposal1_usdc * 10n ** await usdc.decimals(), addr1);

        // accept the proposal
        await acceptProposal(1n, fundController, fundToken, owner, usdc, wETH);

        // now mint more
        const amountToSpend2_usdc = 500_000n;
        await mintFromStableCoin(usdc, usdcAggregator, addr1, fundToken, fundController, amountToSpend2_usdc);
    })

    // tests related to minting when there are multiple assets and the values
    // of the underlying assets change
    // Because fTokens are minting using the NAV value of the underlying assets,
    // this test checks that the minting amount is correct when the value of the
    // underlying assets change
    it("Should mint the fund token correctly: multiple tokens, volitile value", async function ()
    {
        const latestBlock = await hre.ethers.provider.getBlock("latest");
        if(network.network.name !== "localhost" || latestBlock.number < 20000)
        {
            this.skip();
        }

        const { owner, addr1, fundToken, fundController,
            wETH, usdc, usdcAggregator } = await loadFixture(contractDeploymentForkedFixture);

        // deploy a mock wETH aggregator to manipulate the value of wETH in the fund
        const wethMockAggregator = await hre.ethers.deployContract("MockV3Aggregator",
                    [wethAggregatorMockConstants.decimals,
                    wethAggregatorMockConstants.initialAnswer * 10n ** wethAggregatorMockConstants.decimals]);
        await wethMockAggregator.waitForDeployment();

        // add wETH to the fund
        await addAssetToFund(fundController, fundToken, await wETH.getAddress(), await wethMockAggregator.getAddress());

        // mint a few times
        const amountToSpend_usdc = 10_000n;
        await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, amountToSpend_usdc);
        await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, amountToSpend_usdc);
        // move all of the funds assets into wETH
        await createProposal(fundController, await usdc.getAddress(), await wETH.getAddress(),
                             amountToSpend_usdc * 2n * 10n ** await usdc.decimals(), addr1);
        await acceptProposal(1n, fundController, fundToken, owner, usdc, wETH);

        // now cut the value of the fund in half
        await wethMockAggregator.updateAnswer(wethAggregatorMockConstants.initialAnswer * 10n ** wethAggregatorMockConstants.decimals / 2n);


        // now we test minting double as much fToken for the same price
        let totalSupplyBeforeThirdMint = await fundToken.totalSupply();
        await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, amountToSpend_usdc);


        // this test needs to be an approximation because now two assets are involved and
        // also because 1 USDC is not exactly equal to $1 (we are not using a mock aggregator for usdc)
        // if 1 USDC = exactly $1 this approximation would not be needed
        const epsilonMint = await fundToken.totalSupply() / 100n;
        expect(await fundToken.totalSupply()).to.be.closeTo(totalSupplyBeforeThirdMint * 2n, epsilonMint);

        await wethMockAggregator.updateAnswer(wethAggregatorMockConstants.initialAnswer * 10n ** wethAggregatorMockConstants.decimals * 2n);
        const totalSupplyBeforeFourthMint = await fundToken.totalSupply();
        const totalFundValueBeforeFourthMint = await fundToken.getTotalValueOfFund();

        await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, amountToSpend_usdc);
        const amountMinted = await fundToken.totalSupply() - totalSupplyBeforeFourthMint;

        expect(amountMinted).to.be.closeTo(((amountToSpend_usdc * 10n ** await usdc.decimals() * totalSupplyBeforeFourthMint) /
                            (totalFundValueBeforeFourthMint)), epsilonMint);

    })

    // this test is meant to check that the fund controller can burn
    // and redeem the fund token correctly when dealing with multiple assets
    // It checks to make sure that the user gets the correct amount of each asset
    // based on the proportion of the fund token they own compared to the total supply
    it("Should burn and redeem assets correctly: multiple tokens", async function ()
    {
        const latestBlock = await hre.ethers.provider.getBlock("latest");
        if(network.network.name !== "localhost" || latestBlock.number < 20000)
        {
            this.skip();
        }

        const { owner, addr1, addr2,
            fundToken, fundController,
            cbBTC, wETH, usdc,
            usdcAggregator } = await loadFixture(contractDeploymentForkedFixture);

        // mint the fund token, amountToSpend is in usdc
        const amountToSpend_usdc = 100_000n;
        await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, amountToSpend_usdc);

        // now add the wETH and cbBTC to the fund token
        await addAssetToFund(fundController, fundToken, await wETH.getAddress(), baseMainnetConstants.wETHAggregatorAddress);
        await addAssetToFund(fundController, fundToken, await cbBTC.getAddress(), baseMainnetConstants.cbBTCAggregatorAddress);

        // now we can make proposals to be accepted for wETH and cbBTC
        const amountToSpendProposal1_usdc = 2_000n;
        await createProposal(fundController, await usdc.getAddress(), await wETH.getAddress(),
            amountToSpendProposal1_usdc * 10n ** await usdc.decimals(), addr1);


        const amountToSpendProposal2_usdc = 10_000n;
        await createProposal(fundController, await usdc.getAddress(), await cbBTC.getAddress(),
            amountToSpendProposal2_usdc * 10n ** await usdc.decimals(), addr2);

        // now we can have the owner accept the proposal
        await acceptProposal(1n, fundController, fundToken, owner, usdc, wETH);
        await acceptProposal(2n, fundController, fundToken, owner, usdc, cbBTC);

        // Record all of the values before the burn for testing
        const ownerFundTokenAmountBeforeRedeem = await fundToken.balanceOf(await owner.getAddress());
        const ownerUSDCBeforeRedeem = await usdc.balanceOf(await owner.getAddress());
        const ownerWETHBeforeRedeem = await wETH.balanceOf(await owner.getAddress());
        const ownerCBBTCBeforeRedeem = await cbBTC.balanceOf(await owner.getAddress());

        const fundTokenTotalSupplyBeforeRedeem = await fundToken.totalSupply();
        const fundTokenUSDCBeforeRedeem = await usdc.balanceOf(await fundToken.getAddress());
        const fundTokenWETHBeforeRedeem = await wETH.balanceOf(await fundToken.getAddress());
        const fundTokenCBBTCBeforeRedeem = await cbBTC.balanceOf(await fundToken.getAddress());

        // now we can burn the fund token and redeem the assets
        // Redeeming 0.5% of the fund: (1 / 200) = 0.005 = 0.5%
        // amountToRedeem is in fToken in 10** fToken-decimals units
        const amountToRedeemRaw_fToken = await fundToken.totalSupply() / 200n;
        await fundController.connect(owner).redeemAssets(amountToRedeemRaw_fToken);

        // check that the total supply of the fund token has decreased
        expect(await fundToken.totalSupply()).to.equal(
            fundTokenTotalSupplyBeforeRedeem - amountToRedeemRaw_fToken);

        // check that the amount of USDC in the fund decreased
        expect(await usdc.balanceOf(await fundToken.getAddress())).to.equal(
            fundTokenUSDCBeforeRedeem - ((fundTokenUSDCBeforeRedeem *
            amountToRedeemRaw_fToken) / fundTokenTotalSupplyBeforeRedeem));

        // check that the amount of wETH in the fund decreased
        expect(await wETH.balanceOf(await fundToken.getAddress())).to.equal(
            fundTokenWETHBeforeRedeem - ((fundTokenWETHBeforeRedeem *
            amountToRedeemRaw_fToken) / fundTokenTotalSupplyBeforeRedeem));

        // check that the amount of cbBTC in the fund decreased
        expect(await cbBTC.balanceOf(await fundToken.getAddress())).to.equal(
            fundTokenCBBTCBeforeRedeem - ((fundTokenCBBTCBeforeRedeem *
            amountToRedeemRaw_fToken) / fundTokenTotalSupplyBeforeRedeem));

        // check the amount of fund token owned by the owner decreased
        expect(await fundToken.balanceOf(await owner.getAddress())).to.equal(
            ownerFundTokenAmountBeforeRedeem - amountToRedeemRaw_fToken);

        // check the amount of USDC owned by the owner increased
        expect(await usdc.balanceOf(await owner.getAddress())).to.equal(
            ownerUSDCBeforeRedeem + ((fundTokenUSDCBeforeRedeem *
            amountToRedeemRaw_fToken) / fundTokenTotalSupplyBeforeRedeem));

        // check the amount of wETH owned by the owner increased 
        expect(await wETH.balanceOf(await owner.getAddress())).to.equal(
            ownerWETHBeforeRedeem + ((fundTokenWETHBeforeRedeem *
            amountToRedeemRaw_fToken) / fundTokenTotalSupplyBeforeRedeem));

        // check the amount of cbBTC owned by the owner increased
        expect(await cbBTC.balanceOf(await owner.getAddress())).to.equal(
            ownerCBBTCBeforeRedeem + ((fundTokenCBBTCBeforeRedeem *
            amountToRedeemRaw_fToken) / fundTokenTotalSupplyBeforeRedeem));
    })

    // This test is meant to check that the owner/governor can accept a proposal
    // that is submitted by a user and that the trade from the proposal gets
    // executed correctly
    it("Should make a trade by the owner accepting a proposal submitted by a user", async function ()
    {
        const latestBlock = await hre.ethers.provider.getBlock("latest");
        if(network.network.name !== "localhost" || latestBlock.number < 20000)
        {
            this.skip();
        }

        const { owner, addr1, addr2,
            fundToken, fundController,
            cbBTC, wETH, usdc,
            usdcAggregator} = await loadFixture(contractDeploymentForkedFixture);

        // mint the fund token
        const amountToSpend_usdc = 100_000n;
        await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, amountToSpend_usdc);

        // now add the wETH and cbBTC to the fund
        await addAssetToFund(fundController, fundToken, await wETH.getAddress(), baseMainnetConstants.wETHAggregatorAddress);
        await addAssetToFund(fundController, fundToken, await cbBTC.getAddress(), baseMainnetConstants.cbBTCAggregatorAddress);

        // now we can make proposals to be accepted
        const amountToSpendProposal1_usdc = 2_000n;
        await createProposal(fundController, await usdc.getAddress(), await wETH.getAddress(),
            amountToSpendProposal1_usdc * 10n ** await usdc.decimals(), addr1);

        const amountToSpendProposal2_usdc = 100_000n;
        await createProposal(fundController, await usdc.getAddress(), await cbBTC.getAddress(),
            amountToSpendProposal2_usdc * 10n ** await usdc.decimals(), addr2);

        // now we can have the owner accept the proposal
        await acceptProposal(1n, fundController, fundToken, owner, usdc, wETH);

        // test adding another proposal after one was accepted
        const amountOfWETHToSpendOnProposalRaw_wETH = BigInt(
            0.2 * 10 ** Number(await wETH.decimals()));
        await createProposal(fundController, await wETH.getAddress(), await usdc.getAddress(),
            amountOfWETHToSpendOnProposalRaw_wETH, addr1);

        // now test accepting another proposal
        await acceptProposal(3n, fundController, fundToken, owner, wETH, usdc);

    })
    // this test is meant to check that the payout functions work correctly
    // when a single epoch as passed with a single proposer and a single governor
    // In this case, the proposer and governor should not have to split any reward
    // for this epoch because there is only one of each
    it("Should payout the proposer and the governor correctly: single proposer, single governor, single epoch", async function ()
    {
        const latestBlock = await hre.ethers.provider.getBlock("latest");
        if(network.network.name !== "localhost" || latestBlock.number < 20000)
        {
            this.skip();
        }
        const { owner, addr1,
            fundToken, fundController,
            cbBTC, wETH, usdc,
            usdcAggregator} = await loadFixture(contractDeploymentForkedFixture);

        // now mint the fund token
        const amountToSpend_usdc = 100_000n;
        await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, amountToSpend_usdc);

        // now add the wETH and cbBTC to the fund token
        await addAssetToFund(fundController, fundToken, await wETH.getAddress(), baseMainnetConstants.wETHAggregatorAddress);
        await addAssetToFund(fundController, fundToken, await cbBTC.getAddress(), baseMainnetConstants.cbBTCAggregatorAddress);

        // now we can make proposals to be accepted
        const amountToSpendProposal1_usdc = 2_001n;
        await createProposal(fundController, await usdc.getAddress(), await wETH.getAddress(),
            amountToSpendProposal1_usdc * 10n ** await usdc.decimals(), addr1);

        await acceptProposal(1n, fundController, fundToken, owner, usdc, wETH);

        // get the balances before for testing
        const fTokenTotalSupplyBeforePayout = await fundToken.totalSupply();
        const governorBalanceBeforePayout = await fundToken.balanceOf(owner.getAddress());
        const proposerBalanceBeforePayout = await fundToken.balanceOf(addr1.getAddress());
        // check the fToken balance of addr1
        expect(await fundToken.balanceOf(addr1.getAddress())).to.equal(proposerBalanceBeforePayout);
        expect(await fundToken.balanceOf(owner.getAddress())).to.equal(governorBalanceBeforePayout);

        // check that calling the payout functions before the epoch deadline
        // doesn't change the balances
        await fundController.payoutProposers();
        await fundController.payoutGovernors();
        expect(await fundToken.balanceOf(addr1.getAddress())).to.equal(proposerBalanceBeforePayout);
        expect(await fundToken.balanceOf(owner.getAddress())).to.equal(governorBalanceBeforePayout);

        // now increase the time so the epoch passes, payout the proposer and governor,
        // and test that the balances increased accordingly
        await time.increase(miscConstants.ONE_DAY);
        await fundController.payoutProposers();
        await fundController.payoutGovernors();

        expect(await fundToken.balanceOf(addr1.getAddress())).to.equal(
            (fTokenTotalSupplyBeforePayout / fundControllerConstants.initialPercentageFeeProposers) +
                proposerBalanceBeforePayout);

        expect(await fundToken.balanceOf(owner.getAddress())).to.equal(
            (fTokenTotalSupplyBeforePayout / fundControllerConstants.initialPercentageFeeGovernors) +
                governorBalanceBeforePayout);

    })

    // this test is meant to check that the payout functions work correctly
    // when a single epoch has passed with multiple proposers and a single governor
    // In this case, the proposors should split the reward based on how many of their
    // proposals were accepted, and the governor should get the full reward because
    // he is the only governor
    it("Should payout the proposer and the governor correctly: multiple proposers, single governor, single epoch", async function ()
    {
        const latestBlock = await hre.ethers.provider.getBlock("latest");
        if(network.network.name !== "localhost" || latestBlock.number < 20000)
        {
            this.skip();
        }
        const { owner, addr1, addr2,
            fundToken, fundController,
            cbBTC, wETH, usdc,
            usdcAggregator} = await loadFixture(contractDeploymentForkedFixture);

        const amountToSpend_usdc = 100_000n;
        await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, amountToSpend_usdc);

        // now add the wETH and cbBTC to the fund token
        await addAssetToFund(fundController, fundToken, await wETH.getAddress(), baseMainnetConstants.wETHAggregatorAddress);
        await addAssetToFund(fundController, fundToken, await cbBTC.getAddress(), baseMainnetConstants.cbBTCAggregatorAddress);

        // now we can make proposals to be accepted
        const amountToSpendProposal1_usdc= 2_001n;
        await createProposal(fundController, await usdc.getAddress(), await wETH.getAddress(),
            amountToSpendProposal1_usdc * 10n ** await usdc.decimals(), addr1);
        const amountToSpendProposal2_usdc = 10_000n;
        await createProposal(fundController, await usdc.getAddress(), await cbBTC.getAddress(),
            amountToSpendProposal2_usdc * 10n ** await usdc.decimals(), addr2);
        const amountToSpendProposal3_usdc = 10_000n;
        await createProposal(fundController, await usdc.getAddress(), await cbBTC.getAddress(),
            amountToSpendProposal3_usdc * 10n ** await usdc.decimals(), addr1);

        // accept the proposals
        await acceptProposal(1n, fundController, fundToken, owner, usdc, wETH);
        await acceptProposal(2n, fundController, fundToken, owner, usdc, cbBTC);
        await acceptProposal(3n, fundController, fundToken, owner, usdc, cbBTC);

        // get the balances before for testing
        const fTokenTotalSupplyBeforePayout = await fundToken.totalSupply();
        const governorBalanceBeforePayout = await fundToken.balanceOf(owner.getAddress());
        const proposer1BalanceBeforePayout = await fundToken.balanceOf(addr1.getAddress());
        const proposer2BalanceBeforePayout = await fundToken.balanceOf(addr2.getAddress());

        // check that calling the payout functions before the epoch deadline
        // doesn't change the balances
        await fundController.payoutProposers();
        await fundController.payoutGovernors();

        expect(await fundToken.balanceOf(addr1.getAddress())).to.equal(
            proposer1BalanceBeforePayout);
        expect(await fundToken.balanceOf(addr2.getAddress())).to.equal(
            proposer2BalanceBeforePayout);
        expect(await fundToken.balanceOf(owner.getAddress())).to.equal(
            governorBalanceBeforePayout);

        // now increase the time so the epoch passes, payout the proposers and governors,
        // and test that the balances of each increased correctly
        await time.increase(miscConstants.ONE_DAY);
        await fundController.payoutProposers();
        await fundController.payoutGovernors();

        const totalAcceptedThisEpoch = 3n;
        const proposer1NumAccepted = 2n;
        const proposer2NumAccepted = 1n;
        const governorNumAccepted = 3n;

        // the reward = (totalSupply / percentageFee) * (numYourAcceptedProposals / totalAcceptedProposals)
        // The equation was re-written slightly to avoid rounding errors
        const epsilon = BigInt(1);
        // check for the proposer 1
        expect(await fundToken.balanceOf(addr1.getAddress())).to.be.closeTo
        ((fTokenTotalSupplyBeforePayout * proposer1NumAccepted)
         / (fundControllerConstants.initialPercentageFeeProposers * totalAcceptedThisEpoch)
         + proposer1BalanceBeforePayout, epsilon);

        // check for the proposer 2
        expect(await fundToken.balanceOf(addr2.getAddress())).to.be.closeTo
        ((fTokenTotalSupplyBeforePayout * proposer2NumAccepted)
         / (fundControllerConstants.initialPercentageFeeProposers * totalAcceptedThisEpoch)
         + proposer2BalanceBeforePayout, epsilon);

        // check for the governor
        expect(await fundToken.balanceOf(owner.getAddress())).to.closeTo
        ((fTokenTotalSupplyBeforePayout * governorNumAccepted)
         / (fundControllerConstants.initialPercentageFeeGovernors * totalAcceptedThisEpoch)
         + governorBalanceBeforePayout, epsilon);

    })
    // this test is meant to check that the payout functions work correctly
    // when multiple epochs have passed with multiple proposers and a single governor
    // In this case, the proposors should split the reward based on how many of their
    // proposals were accepted accorss the epochs that they were accepted in,
    // and the governor should get the full reward for each epoch because he is the
    // only governor
    // HOWEVER, the test does not check the case for when more fTokens are minted between epochs
    // and as a result, the total supply changes in between the epoch deadlines
    it("Should payout the proposer and governor correctly: multiple epochs have passed, no mint in-between", async function ()
    {
        const latestBlock = await hre.ethers.provider.getBlock("latest");
        if(network.network.name !== "localhost" || latestBlock.number < 20000)
        {
            this.skip();
        }
        const { owner, addr1, addr2,
            fundToken, fundController,
            cbBTC, wETH, usdc,
            usdcAggregator } = await loadFixture(contractDeploymentForkedFixture);

        // mint the fund token
        const amountToSpend_usdc = 100_000n;
        await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, amountToSpend_usdc);

        // now add the wETH and cbBTC to the fund token
        await addAssetToFund(fundController, fundToken, await wETH.getAddress(), baseMainnetConstants.wETHAggregatorAddress);
        await addAssetToFund(fundController, fundToken, await cbBTC.getAddress(), baseMainnetConstants.cbBTCAggregatorAddress);

        // save the balances before for testing
        const fTokenTotalSupplyBeforePayout = await fundToken.totalSupply();
        const governorBalanceBeforePayout = await fundToken.balanceOf(owner.getAddress());
        const proposer1BalanceBeforePayout = await fundToken.balanceOf(addr1.getAddress());
        const proposer2BalanceBeforePayout = await fundToken.balanceOf(addr2.getAddress());

        // now we can make proposals to be accepted
        const amountToSpendProposal1_usdc = 2_001n;
        await createProposal(fundController, await usdc.getAddress(), await wETH.getAddress(),
            amountToSpendProposal1_usdc * 10n ** await usdc.decimals(), addr1);
        const amountToSpendProposal2_usdc = 10_000n;
        await createProposal(fundController, await usdc.getAddress(), await cbBTC.getAddress(),
            amountToSpendProposal2_usdc * 10n ** await usdc.decimals(), addr2);

        // accept the proposals
        await acceptProposal(1n, fundController, fundToken, owner, usdc, wETH);
        await acceptProposal(2n, fundController, fundToken, owner, usdc, cbBTC);

        // pass the time by 2 epochs
        await time.increase(miscConstants.ONE_DAY * 2n);

        // make another proposal
        const amountToSpendProposal3_usdc = 10_000n;
        await createProposal(fundController, await usdc.getAddress(), await cbBTC.getAddress(),
            amountToSpendProposal3_usdc * 10n ** await usdc.decimals(), addr1);

        // accept the proposal
        await acceptProposal(3n, fundController, fundToken, owner, usdc, cbBTC);

        // increase the time by 2 epochs
        await time.increase(miscConstants.ONE_DAY * 2n);

        // payout the proposers and governors
        await fundController.payoutProposers();
        await fundController.payoutGovernors();

        // constants for setting up the test
        const totalAcceptedFirstEpoch = 2n;
        const proposer1NumAcceptedFirstEpoch = 1n;
        const proposer2NumAcceptedFirstEpoch = 1n;
        const governorNumAcceptedFirstEpoch = 2n;

        const totalAcceptedSecondEpoch = 1n;
        const proposer1NumAcceptedSecondEpoch = 1n;
        const proposer2NumAcceptedSecondEpoch = 0n;
        const governorNumAcceptedSecondEpoch = 1n;

        // the total rewards issued to the proposers during the first epoch
        const totalRewardIssuedFirstEpochToProposers = (fTokenTotalSupplyBeforePayout / fundControllerConstants.initialPercentageFeeProposers);
        // the total rewards issued to the governors during the first epoch
        const totalRewardIssuedFirstEpochToGovernors = (fTokenTotalSupplyBeforePayout / fundControllerConstants.initialPercentageFeeGovernors);

        // the total rewards issued to both the proposers and the governors
        const totalRewardIssuedFirstEpoch = totalRewardIssuedFirstEpochToProposers + totalRewardIssuedFirstEpochToGovernors;

        // the total supply after the first epoch = initial supply + the total rewards issued during epoch
        const fTokenTotalSupplyAfterFirstEpoch = fTokenTotalSupplyBeforePayout + totalRewardIssuedFirstEpoch;

        // the total rewards issued to the proposers during the second epoch
        const totalRewardIssuedSecondEpochToProposers = (fTokenTotalSupplyAfterFirstEpoch / fundControllerConstants.initialPercentageFeeProposers);

        // the total rewards issued to the governors during the second epoch
        const totalRewardIssuedSecondEpochToGovernors = (fTokenTotalSupplyAfterFirstEpoch / fundControllerConstants.initialPercentageFeeGovernors);

        // the total rewards issued to both the proposers and the governors
        const totalRewardIssuedSecondEpoch = totalRewardIssuedSecondEpochToProposers + totalRewardIssuedSecondEpochToGovernors;

        // the total supply after the second epoch = totalSupplyAfterFirstEpoch + the total rewards issued during this epoch
        const fTokenTotalSupplyAfterSecondEpoch = fTokenTotalSupplyAfterFirstEpoch + totalRewardIssuedSecondEpoch;

        // the reward for the proposer = (totalRewardIssuedToPropers1stEpoch *
        // numYourAcceptedProposals1stEpoch / totalAcceptedProposals1stEpoch) + (totalRewardIssuedToPropers2ndEpoch *
        // numYourAcceptedProposals2ndEpoch / totalAcceptedProposals2ndEpoch)
        const proposer1Reward = ((totalRewardIssuedFirstEpochToProposers * proposer1NumAcceptedFirstEpoch)
                                 / totalAcceptedFirstEpoch) + ((totalRewardIssuedSecondEpochToProposers *
                                    proposer1NumAcceptedSecondEpoch) / totalAcceptedSecondEpoch);

        const proposer2Reward = ((totalRewardIssuedFirstEpochToProposers * proposer2NumAcceptedFirstEpoch)
                                 / totalAcceptedFirstEpoch) + ((totalRewardIssuedSecondEpochToProposers *
                                    proposer2NumAcceptedSecondEpoch) / totalAcceptedSecondEpoch);

        const governorReward = ((totalRewardIssuedFirstEpochToGovernors * governorNumAcceptedFirstEpoch)
                                / totalAcceptedFirstEpoch) + ((totalRewardIssuedSecondEpochToGovernors *
                                    governorNumAcceptedSecondEpoch) / totalAcceptedSecondEpoch);

        // check the balances of the proposers and governors after the payout
        // and make sure they got paidout correctly
        expect(await fundToken.balanceOf(addr1.getAddress())).to.equal(
            proposer1BalanceBeforePayout + proposer1Reward);
        expect(await fundToken.balanceOf(addr2.getAddress())).to.equal(
            proposer2BalanceBeforePayout + proposer2Reward);
        expect(await fundToken.balanceOf(owner.getAddress())).to.equal(
            governorBalanceBeforePayout + governorReward);
    })

})
