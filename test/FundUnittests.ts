/**
 * @file FundUnittests.ts
 * @description This file contains the unit tests for the Fund contract.
 * These tests are meant to be run locally and are not meant to be run
 * on a forked version of the testnet or mainnet
 */

import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import network from "hardhat"

import { miscConstants, ethAggregatorMockConstants,
fundControllerConstants } from "./utils/constants";

import { contractDeploymentLocalFixture } from "./utils/fixtures";

import { mintFromStableCoin, addAssetToFund } from "./utils/foundationFunctions";

// the header for the fund local unit tests
describe("Fund Local Unit Tests", function ()
{
    // tests related to initialization
    describe("Initialization", function ()
    {
        // This test is meant to check that the contracts are deployed
        // and initializated correctly
        it("Should deploy the contracts correctly", async function ()
        {
            if (network.network.name !== "hardhat")
            {
                this.skip();
            }
            const { owner, fundToken, fundController } = await loadFixture(contractDeploymentLocalFixture);

            // check the ownership of the fund token
            expect(await fundToken.owner()).to.equal(await fundController.getAddress());

            // check the ownership of the fund fundController
            expect(await fundController.owner()).to.equal(await owner.getAddress());
         })
    })

    // tests related to the Mock Aggregator
    describe("Mock Aggregator", function ()
    {
        // This test is meant to check that the functionalities
        // of the mock aggregator (such as setting and getting a new price)
        // are working correctly
        it("Should return the correct updated values", async function ()
        {
            if (network.network.name !== "hardhat")
            {
                this.skip();
            }
            const ethMockAggregator = await hre.ethers.deployContract("MockV3Aggregator",
                [ethAggregatorMockConstants.decimals,
                ethAggregatorMockConstants.initialAnswer * 10n ** ethAggregatorMockConstants.decimals]);
            await ethMockAggregator.waitForDeployment();

            expect(await ethMockAggregator.decimals()).to.equal(ethAggregatorMockConstants.decimals);
            const firstRoundData = await ethMockAggregator.latestRoundData();

            // the round number
            expect(firstRoundData[0]).to.equal(1);

            // the answer
            expect(firstRoundData[1]).to.equal(ethAggregatorMockConstants.initialAnswer * 10n ** ethAggregatorMockConstants.decimals);

            // save the start time
            const startTime = firstRoundData[2];

            // on initialization the start time and update time are the same
            expect(startTime).to.equal(firstRoundData[3]);

            const newEthPrice = 2000n
            await ethMockAggregator.updateAnswer(newEthPrice * 10n ** ethAggregatorMockConstants.decimals);

            const secondRoundData = await ethMockAggregator.latestRoundData();

            // the round number
            expect(secondRoundData[0]).to.equal(2);

            // the answer
            expect(secondRoundData[1]).to.equal(newEthPrice * 10n ** ethAggregatorMockConstants.decimals);
        })
    })

    // tests related to the fund controller
    describe("Fund Controller", function ()
    {
        // This test is meant to check that the fund controller's setter functions,
        // which are used to set the epoch time and the percentage fees for the
        // proposers and governors, are working correctly
        it("Should set the setter fields correctly", async function ()
        {
            if (network.network.name !== "hardhat")
            {
                this.skip();
            }
            const { fundController } = await loadFixture(contractDeploymentLocalFixture);

            // set the new epoch time to two days
            const newEpochTime = 2n * miscConstants.ONE_DAY;
            await fundController.setEpochTime(newEpochTime);
            // now check the new epoch time
            expect(await fundController.s_epochDuration()).to.equal(newEpochTime);

            // set the new percentage fee for the proposers to 2%
            const newPercentageFeeProposers = 500n;
            await fundController.setProposalPercentageReward(newPercentageFeeProposers);
            // check the new percentage fee for the proposers
            expect(await fundController.s_proposalPercentageReward()).to.equal(newPercentageFeeProposers);

            // set the new percentage fee for the governors to 3%
            const newPercentageFeeGovernors = 333n;
            await fundController.setGovernorPercentageReward(newPercentageFeeGovernors);
            // check the new percentage fee for the governors
            expect(await fundController.s_governorPercentageReward()).to.equal(newPercentageFeeGovernors);

        })
        // This test is meant to check that the fund controller can mint
        // the fund token correctly when the fund is empty
        it("Should mint the fund token correctly: empty fund", async function ()
        {
            if (network.network.name !== "hardhat")
            {
                this.skip();
            }
            const { owner, fundToken, fundController, usdcMock, usdcMockAggregator } = await loadFixture(contractDeploymentLocalFixture);
            await usdcMockAggregator.updateAnswer(1n * 10n ** await usdcMockAggregator.decimals());
            const amountToSpend_usdc = 1_000n;
            await mintFromStableCoin(usdcMock, usdcMockAggregator, owner, fundToken, fundController, amountToSpend_usdc); 

        })
        // This test is meant to check that the fund controller can mint
        // and burn the fund token correctly when only dealing with
        // the base asset
        it("Should burn and redeem assets correctly: single token", async function ()
        {
            if (network.network.name !== "hardhat")
            {
                this.skip();
            }
            const { owner, fundToken, fundController, usdcMock, usdcMockAggregator } = await loadFixture(contractDeploymentLocalFixture);
            await usdcMockAggregator.updateAnswer(1n * 10n ** await usdcMockAggregator.decimals());
            const amountToSpend_usdc = 100_000n;
            await mintFromStableCoin(usdcMock, usdcMockAggregator, owner, fundToken, fundController, amountToSpend_usdc);

            // get the before values for testing later
            const ownerFundTokenAmountBeforeRedeem = await fundToken.balanceOf(await owner.getAddress());
            const ownerUSDCBeforeRedeem = await usdcMock.balanceOf(await owner.getAddress());
            const fundTokenUSDCBeforeRedeem = await usdcMock.balanceOf(await fundToken.getAddress());
            const fundTokenTotalSupplyBeforeRedeem = await fundToken.totalSupply();

            // NOTE: In this simple example, because we are only dealing with one asset we set
            // the ratio of fToken to USDC as 1:100 as specified by the aggregator
            // Hence amountToRedeem can be used for both the fund token and the USDC calcualtions
            const amountToRedeem = 100n;
            await fundController.connect(owner).redeemAssets(amountToRedeem * 10n ** await fundToken.decimals());

            // check that the total supply of the fund token has decreased
            expect(await fundToken.totalSupply()).to.equal(
                fundTokenTotalSupplyBeforeRedeem - amountToRedeem * 10n ** await fundToken.decimals());

            // check that the amount of USDC in the fund decreased
            expect(await usdcMock.balanceOf(await fundToken.getAddress())).to.equal(
                fundTokenUSDCBeforeRedeem - amountToRedeem * 10n ** await usdcMock.decimals() *
                    fundControllerConstants.initialMintingUnitConversion);

            // check the amount of fund token owned by the owner decreased
            expect(await fundToken.balanceOf(await owner.getAddress())).to.equal(
                ownerFundTokenAmountBeforeRedeem - amountToRedeem * 10n ** await fundToken.decimals());

            // check the amount of USDC owned by the owner increased
            expect(await usdcMock.balanceOf(await owner.getAddress())).to.equal(
                ownerUSDCBeforeRedeem + amountToRedeem * 10n ** await usdcMock.decimals() *
                    fundControllerConstants.initialMintingUnitConversion);
            
        })
    })

    // tests related to the fund token
    describe("Fund Token", function ()
    {
        // This test is meant to check that the fund controller
        // can add an ERC20 asset to the fund token
        it("Should add an asset to the fund token", async function ()
        {
            if (network.network.name !== "hardhat")
            {
                this.skip();
            }
            const { fundToken, fundController,
                wethMock, wethMockAggregator,
                cbBTCMock, cbBTCMockAggregator} = await loadFixture(contractDeploymentLocalFixture);

            // add an asset
            await addAssetToFund(fundController, fundToken, await wethMock.getAddress(), await wethMockAggregator.getAddress());
            // now add another asset
            await addAssetToFund(fundController, fundToken, await cbBTCMock.getAddress(), await cbBTCMockAggregator.getAddress());

        })
    })
});
