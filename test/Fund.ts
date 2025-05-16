import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import network from "hardhat"

import { miscConstants, baseMainnetConstants,
ethAggregatorMockConstants, wethAggregatorMockConstants,
fundControllerConstants } from "./utils/constants";

import { contractDeploymentLocalFixture,
contractDeploymentForkedFixture } from "./utils/fixtures";

import { mintFromStableCoin, addAssetToFund,
    createProposal, acceptProposal } from "./utils/foundationFunctions";

// at block 29878423 on base:
// eth price: ~$1800
// cbBTC price: ~$95,000

describe("Fund Functionalities", function ()
{
    describe("Initialization", function ()
    {
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

    describe("Mock Aggregator", function ()
    {
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

    describe("Fund Controller", function ()
    {
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
            expect(await fundController.s_epochTime()).to.equal(newEpochTime);

            // set the new percentage fee for the proposers to 2%
            const newPercentageFeeProposers = 200n;
            await fundController.setProposalPercentageReward(newPercentageFeeProposers);
            // check the new percentage fee for the proposers
            expect(await fundController.s_proposalPercentageReward()).to.equal(newPercentageFeeProposers);

            // set the new percentage fee for the governors to 3%
            const newPercentageFeeGovernors = 300n;
            await fundController.setGovernorPercentageReward(newPercentageFeeGovernors);
            // check the new percentage fee for the governors
            expect(await fundController.s_governorPercentageReward()).to.equal(newPercentageFeeGovernors);

        })
        it("Should mint the fund token correctly: single token", async function ()
        {
            if (network.network.name !== "hardhat")
            {
                this.skip();
            }
            const { owner, fundToken, fundController, usdcMock, usdcMockAggregator } = await loadFixture(contractDeploymentLocalFixture);
            await usdcMockAggregator.updateAnswer(1n * 10n ** await usdcMockAggregator.decimals());
            const AmountToSendOwner = 1000n;
            await mintFromStableCoin(usdcMock, usdcMockAggregator, owner, fundToken, fundController, AmountToSendOwner); 

        })
        it("Should mint the fund token correctly: multiple tokens, stable value", async function ()
        {
            const latestBlock = await hre.ethers.provider.getBlock("latest");
            if(network.network.name !== "localhost" || latestBlock.number < 20000)
            {
                this.skip();
            }

            const { owner, addr1, fundToken, fundController,
                cbBTC, wETH, usdc, usdcAggregator } = await loadFixture(contractDeploymentForkedFixture);

            // now mint the fund token
            const amountToMint1 = 100_000n;
            await mintFromStableCoin(usdc, usdcAggregator,
                                                 owner, fundToken, fundController, amountToMint1);

            // now add the wETH and cbBTC to the fund token
            await addAssetToFund(fundController, fundToken, await wETH.getAddress(),
                                 baseMainnetConstants.wETHAggregatorAddress);
            await addAssetToFund(fundController, fundToken, await cbBTC.getAddress(),
                                 baseMainnetConstants.cbBTCAggregatorAddress);

            // now we can make proposals to be accepted
            const amountToSpendProposal1 = 2_000n;
            await createProposal(fundController, await usdc.getAddress(), await wETH.getAddress(),
                amountToSpendProposal1 * 10n ** await usdc.decimals(), addr1);

            await acceptProposal(1n, fundController, fundToken, owner, usdc, wETH);

            // now mint more
            const amountToMint2 = 500_000n;
            await mintFromStableCoin(usdc, usdcAggregator, addr1, fundToken, fundController, amountToMint2);
        })
        it("Should mint the fund token correctly: multiple tokens, volitile value", async function ()
        {
            const latestBlock = await hre.ethers.provider.getBlock("latest");
            if(network.network.name !== "localhost" || latestBlock.number < 20000)
            {
                this.skip();
            }

            const { owner, addr1, fundToken, fundController,
                wETH, usdc, usdcAggregator } = await loadFixture(contractDeploymentForkedFixture);
            const wethMockAggregator = await hre.ethers.deployContract("MockV3Aggregator",
                        [wethAggregatorMockConstants.decimals,
                        wethAggregatorMockConstants.initialAnswer * 10n ** wethAggregatorMockConstants.decimals]);
            await wethMockAggregator.waitForDeployment();

            await addAssetToFund(fundController, fundToken, await wETH.getAddress(), await wethMockAggregator.getAddress());

            await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, 10_000n);

            await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, 10_000n);
            // move all of the funds assets into weth
            await createProposal(fundController, await usdc.getAddress(), await wETH.getAddress(), 20_000n * 10n ** await usdc.decimals(), addr1);
            await acceptProposal(1n, fundController, fundToken, owner, usdc, wETH);

            // now cut the fund in half
            await wethMockAggregator.updateAnswer(wethAggregatorMockConstants.initialAnswer * 10n ** wethAggregatorMockConstants.decimals / 2n);


            // now we test minting double as much fToken for the same price
            let totalSupplyBeforeMint = await fundToken.totalSupply();
            await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, 10_000n);


            // this one needs to be an approximation because now two assets are involved and
            // 1 USDC is not exactly equal to $1
            // if 1 USDC = exactly $1 this approximation would not be needed
            const epsilonMint = await fundToken.totalSupply() / 100n;
            expect(await fundToken.totalSupply()).to.be.closeTo(totalSupplyBeforeMint * 2n, epsilonMint);

            // now the total supply should be around 400 fToken

            await wethMockAggregator.updateAnswer(wethAggregatorMockConstants.initialAnswer * 10n ** wethAggregatorMockConstants.decimals * 2n);
            totalSupplyBeforeMint = await fundToken.totalSupply();
            const totalFundValueBeforeMint = await fundToken.getTotalValueOfFund();

            await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, 10_000n);
            const amountMinted = await fundToken.totalSupply() - totalSupplyBeforeMint;

            expect(amountMinted).to.be.closeTo(((10_000n * 10n ** await usdc.decimals() * totalSupplyBeforeMint) /
                                (totalFundValueBeforeMint)), epsilonMint);

        })
        it("Should burn and redeem assets correctly: single token", async function ()
        {
            const initialMintingRate = 10n ** 2n;
            if (network.network.name !== "hardhat")
            {
                this.skip();
            }
            const { owner, fundToken, fundController, usdcMock, usdcMockAggregator } = await loadFixture(contractDeploymentLocalFixture);
            await usdcMockAggregator.updateAnswer(1n * 10n ** await usdcMockAggregator.decimals());
            const AmountToSendOwner = 100000n;
            await mintFromStableCoin(usdcMock, usdcMockAggregator, owner, fundToken, fundController, AmountToSendOwner);

            // now we can burn the fund token and redeem the assets
            const ownerFundTokenAmountBeforeRedeem = await fundToken.balanceOf(await owner.getAddress());
            const ownerUSDCBeforeRedeem = await usdcMock.balanceOf(await owner.getAddress());
            const fundTokenUSDCBeforeRedeem = await usdcMock.balanceOf(await fundToken.getAddress());
            const fundTokenTotalSupplyBeforeRedeem = await fundToken.totalSupply();

            // NOTE: In this simple example, because we are only dealing with one asset
            // the ratio of fToken to USDC is 1:100
            // Hence amountToRedeem can be used for both the fund token and the USDC calcualtions
            const amountToRedeem = 100n;
            await fundController.connect(owner).redeemAssets(amountToRedeem * 10n ** await fundToken.decimals());

            // check that the total supply of the fund token has decreased
            expect(await fundToken.totalSupply()).to.equal(
                fundTokenTotalSupplyBeforeRedeem - amountToRedeem * 10n ** await fundToken.decimals());

            // check that the amount of USDC in the fund decreased
            expect(await usdcMock.balanceOf(await fundToken.getAddress())).to.equal(
                fundTokenUSDCBeforeRedeem - amountToRedeem * 10n ** await usdcMock.decimals() * initialMintingRate);

            // check the amount of fund token owned by the owner decreased
            expect(await fundToken.balanceOf(await owner.getAddress())).to.equal(
                ownerFundTokenAmountBeforeRedeem - amountToRedeem * 10n ** await fundToken.decimals());

            // check the amount of USDC owned by the owner increased
            expect(await usdcMock.balanceOf(await owner.getAddress())).to.equal(
                ownerUSDCBeforeRedeem + amountToRedeem * 10n ** await usdcMock.decimals() * initialMintingRate);
            
        })
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

            // now mint the fund token
            const amountToSpend = 100_000n;
            await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, amountToSpend);

            // now add the wETH and cbBTC to the fund token
            await addAssetToFund(fundController, fundToken, await wETH.getAddress(), baseMainnetConstants.wETHAggregatorAddress);
            await addAssetToFund(fundController, fundToken, await cbBTC.getAddress(), baseMainnetConstants.cbBTCAggregatorAddress);

            // now we can make proposals to be accepted
            const amountToSpendProposal1 = 2_000n;
            await createProposal(fundController, await usdc.getAddress(), await wETH.getAddress(),
                amountToSpendProposal1 * 10n ** await usdc.decimals(), addr1);


            const amountToSpendProposal2 = 10_000n;
            await createProposal(fundController, await usdc.getAddress(), await cbBTC.getAddress(),
                amountToSpendProposal2 * 10n ** await usdc.decimals(), addr2);

            // now we can have the owner accept the proposal
            await acceptProposal(1n, fundController, fundToken, owner, usdc, wETH);
            await acceptProposal(2n, fundController, fundToken, owner, usdc, cbBTC);

            // now we can burn the fund token and redeem the assets
            const ownerFundTokenAmountBeforeRedeem = await fundToken.balanceOf(await owner.getAddress());
            const ownerUSDCBeforeRedeem = await usdc.balanceOf(await owner.getAddress());
            const ownerWETHBeforeRedeem = await wETH.balanceOf(await owner.getAddress());
            const ownerCBBTCBeforeRedeem = await cbBTC.balanceOf(await owner.getAddress());

            const fundTokenTotalSupplyBeforeRedeem = await fundToken.totalSupply();
            const fundTokenUSDCBeforeRedeem = await usdc.balanceOf(await fundToken.getAddress());
            const fundTokenWETHBeforeRedeem = await wETH.balanceOf(await fundToken.getAddress());
            const fundTokenCBBTCBeforeRedeem = await cbBTC.balanceOf(await fundToken.getAddress());

            // Redeeming 0.5% of the fund
            const amountToRedeem = amountToSpend / 200n;
            await fundController.connect(owner).redeemAssets(amountToRedeem * 10n ** await fundToken.decimals());

            // check that the total supply of the fund token has decreased
            expect(await fundToken.totalSupply()).to.equal(
                fundTokenTotalSupplyBeforeRedeem - amountToRedeem * 10n ** await fundToken.decimals());

            // check that the amount of USDC in the fund decreased
            expect(await usdc.balanceOf(await fundToken.getAddress())).to.equal(
                fundTokenUSDCBeforeRedeem - ((fundTokenUSDCBeforeRedeem *
                amountToRedeem * 10n ** await fundToken.decimals())
                / fundTokenTotalSupplyBeforeRedeem));

            // check that the amount of wETH in the fund decreased
            expect(await wETH.balanceOf(await fundToken.getAddress())).to.equal(
                fundTokenWETHBeforeRedeem - ((fundTokenWETHBeforeRedeem *
                amountToRedeem * 10n ** await fundToken.decimals())
                / fundTokenTotalSupplyBeforeRedeem));

            // check that the amount of cbBTC in the fund decreased
            expect(await cbBTC.balanceOf(await fundToken.getAddress())).to.equal(
                fundTokenCBBTCBeforeRedeem - ((fundTokenCBBTCBeforeRedeem *
                amountToRedeem * 10n ** await fundToken.decimals())
                / fundTokenTotalSupplyBeforeRedeem));

            // check the amount of fund token owned by the owner decreased
            expect(await fundToken.balanceOf(await owner.getAddress())).to.equal(
                ownerFundTokenAmountBeforeRedeem - amountToRedeem * 10n ** await fundToken.decimals());

            // check the amount of USDC owned by the owner increased
            expect(await usdc.balanceOf(await owner.getAddress())).to.equal(
                ownerUSDCBeforeRedeem + ((fundTokenUSDCBeforeRedeem *
                amountToRedeem * 10n ** await fundToken.decimals())
                / fundTokenTotalSupplyBeforeRedeem));

            // check the amount of wETH owned by the owner increased 
            expect(await wETH.balanceOf(await owner.getAddress())).to.equal(
                ownerWETHBeforeRedeem + ((fundTokenWETHBeforeRedeem *
                amountToRedeem * 10n ** await fundToken.decimals())
                / fundTokenTotalSupplyBeforeRedeem));

            // check the amount of cbBTC owned by the owner increased
            expect(await cbBTC.balanceOf(await owner.getAddress())).to.equal(
                ownerCBBTCBeforeRedeem + ((fundTokenCBBTCBeforeRedeem *
                amountToRedeem * 10n ** await fundToken.decimals())
                / fundTokenTotalSupplyBeforeRedeem));
        })
        it("Should make a trade by the owner accepting a proposal submitted by a user", async function ()
        {
            // await resetForkedNetwork();
            const latestBlock = await hre.ethers.provider.getBlock("latest");
            if(network.network.name !== "localhost" || latestBlock.number < 20000)
            {
                this.skip();
            }

            const { owner, addr1, addr2,
                fundToken, fundController,
                cbBTC, wETH, usdc,
                usdcAggregator} = await loadFixture(contractDeploymentForkedFixture);

            // now mint the fund token
            const amountToSpend = 100000n;
            await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, amountToSpend);

            // now add the wETH and cbBTC to the fund token
            await addAssetToFund(fundController, fundToken, await wETH.getAddress(), baseMainnetConstants.wETHAggregatorAddress);
            await addAssetToFund(fundController, fundToken, await cbBTC.getAddress(), baseMainnetConstants.cbBTCAggregatorAddress);

            // now we can make proposals to be accepted
            const amountToSpendProposal1 = 2000n;
            await createProposal(fundController, await usdc.getAddress(), await wETH.getAddress(),
                amountToSpendProposal1 * 10n ** await usdc.decimals(), addr1);


            const amountToSpendProposal2 = 100000n;
            await createProposal(fundController, await usdc.getAddress(), await cbBTC.getAddress(),
                amountToSpendProposal2 * 10n ** await usdc.decimals(), addr2);

            // now we can have the owner accept the proposal
            await acceptProposal(1n, fundController, fundToken, owner, usdc, wETH);

            // test adding another proposal after one was accepted
            const amountOfWETHToSpendOnProposal_RAW = BigInt(
                0.2 * 10 ** Number(await wETH.decimals()));
            await createProposal(fundController, await wETH.getAddress(), await usdc.getAddress(),
                amountOfWETHToSpendOnProposal_RAW, addr1);
        })
        it("Should payout the proposer and the governor correctly: single proposer and single governor", async function ()
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
            const amountToSpend = 100000n;
            await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, amountToSpend);

            // now add the wETH and cbBTC to the fund token
            await addAssetToFund(fundController, fundToken, await wETH.getAddress(), baseMainnetConstants.wETHAggregatorAddress);
            await addAssetToFund(fundController, fundToken, await cbBTC.getAddress(), baseMainnetConstants.cbBTCAggregatorAddress);

            // now we can make proposals to be accepted
            const amountToSpendProposal1 = 2001n;
            await createProposal(fundController, await usdc.getAddress(), await wETH.getAddress(),
                amountToSpendProposal1 * 10n ** await usdc.decimals(), addr1);

            await acceptProposal(1n, fundController, fundToken, owner, usdc, wETH);

            const fTokenTotalSupplyBeforePayout = await fundToken.totalSupply();
            const governorBalanceBeforePayout = await fundToken.balanceOf(owner.getAddress());
            const proposerBalanceBeforePayout = await fundToken.balanceOf(addr1.getAddress());
            // check the fToken balance of addr1
            expect(await fundToken.balanceOf(addr1.getAddress())).to.equal(proposerBalanceBeforePayout);
            expect(await fundToken.balanceOf(owner.getAddress())).to.equal(governorBalanceBeforePayout);
            await fundController.payoutProposers();
            expect(await fundToken.balanceOf(addr1.getAddress())).to.equal(proposerBalanceBeforePayout);
            expect(await fundToken.balanceOf(owner.getAddress())).to.equal(governorBalanceBeforePayout);
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

        it("Should payout the proposer and the governor correctly: multiple proposers and multiple governors", async function ()
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
            const amountToSpend = 100_000n;
            await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, amountToSpend);

            // now add the wETH and cbBTC to the fund token
            await addAssetToFund(fundController, fundToken, await wETH.getAddress(), baseMainnetConstants.wETHAggregatorAddress);
            await addAssetToFund(fundController, fundToken, await cbBTC.getAddress(), baseMainnetConstants.cbBTCAggregatorAddress);

            // now we can make proposals to be accepted
            const amountToSpendProposal1 = 2_001n;
            await createProposal(fundController, await usdc.getAddress(), await wETH.getAddress(),
                amountToSpendProposal1 * 10n ** await usdc.decimals(), addr1);
            const amountToSpendProposal2 = 10_000n;
            await createProposal(fundController, await usdc.getAddress(), await cbBTC.getAddress(),
                amountToSpendProposal2 * 10n ** await usdc.decimals(), addr2);
            const amountToSpendProposal3 = 10_000n;
            await createProposal(fundController, await usdc.getAddress(), await cbBTC.getAddress(),
                amountToSpendProposal3 * 10n ** await usdc.decimals(), addr1);

            await acceptProposal(1n, fundController, fundToken, owner, usdc, wETH);
            await acceptProposal(2n, fundController, fundToken, owner, usdc, cbBTC);
            await acceptProposal(3n, fundController, fundToken, owner, usdc, cbBTC);

            const fTokenTotalSupplyBeforePayout = await fundToken.totalSupply();
            const governorBalanceBeforePayout = await fundToken.balanceOf(owner.getAddress());
            const proposer1BalanceBeforePayout = await fundToken.balanceOf(addr1.getAddress());
            const proposer2BalanceBeforePayout = await fundToken.balanceOf(addr2.getAddress());

            await fundController.payoutProposers();
            await fundController.payoutGovernors();

            expect(await fundToken.balanceOf(addr1.getAddress())).to.equal(
                proposer1BalanceBeforePayout);
            expect(await fundToken.balanceOf(addr2.getAddress())).to.equal(
                proposer2BalanceBeforePayout);
            expect(await fundToken.balanceOf(owner.getAddress())).to.equal(
                governorBalanceBeforePayout);

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
            expect(await fundToken.balanceOf(addr1.getAddress())).to.be.closeTo
            ((fTokenTotalSupplyBeforePayout * proposer1NumAccepted)
             / (fundControllerConstants.initialPercentageFeeProposers * totalAcceptedThisEpoch)
             + proposer1BalanceBeforePayout, epsilon);

            expect(await fundToken.balanceOf(addr2.getAddress())).to.be.closeTo
            ((fTokenTotalSupplyBeforePayout * proposer2NumAccepted)
             / (fundControllerConstants.initialPercentageFeeProposers * totalAcceptedThisEpoch)
             + proposer2BalanceBeforePayout, epsilon);

            expect(await fundToken.balanceOf(owner.getAddress())).to.closeTo
            ((fTokenTotalSupplyBeforePayout * governorNumAccepted)
             / (fundControllerConstants.initialPercentageFeeGovernors * totalAcceptedThisEpoch)
             + governorBalanceBeforePayout, epsilon);

        })
        it("Should payout the proposer and governor correctly: multiple epochs have passed", async function ()
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
            const amountToSpend = 100_000n;
            await mintFromStableCoin(usdc, usdcAggregator, owner, fundToken, fundController, amountToSpend);

            // now add the wETH and cbBTC to the fund token
            await addAssetToFund(fundController, fundToken, await wETH.getAddress(), baseMainnetConstants.wETHAggregatorAddress);
            await addAssetToFund(fundController, fundToken, await cbBTC.getAddress(), baseMainnetConstants.cbBTCAggregatorAddress);

            const fTokenTotalSupplyBeforePayout = await fundToken.totalSupply();
            const governorBalanceBeforePayout = await fundToken.balanceOf(owner.getAddress());
            const proposer1BalanceBeforePayout = await fundToken.balanceOf(addr1.getAddress());
            const proposer2BalanceBeforePayout = await fundToken.balanceOf(addr2.getAddress());
            // now we can make proposals to be accepted
            const amountToSpendProposal1 = 2_001n;
            await createProposal(fundController, await usdc.getAddress(), await wETH.getAddress(),
                amountToSpendProposal1 * 10n ** await usdc.decimals(), addr1);
            const amountToSpendProposal2 = 10_000n;
            await createProposal(fundController, await usdc.getAddress(), await cbBTC.getAddress(),
                amountToSpendProposal2 * 10n ** await usdc.decimals(), addr2);

            await acceptProposal(1n, fundController, fundToken, owner, usdc, wETH);
            await acceptProposal(2n, fundController, fundToken, owner, usdc, cbBTC);

            await time.increase(miscConstants.ONE_DAY * 2n);

            const amountToSpendProposal3 = 10_000n;
            await createProposal(fundController, await usdc.getAddress(), await cbBTC.getAddress(),
                amountToSpendProposal3 * 10n ** await usdc.decimals(), addr1);

            await acceptProposal(3n, fundController, fundToken, owner, usdc, cbBTC);

            await time.increase(miscConstants.ONE_DAY * 2n);

            await fundController.payoutProposers();
            await fundController.payoutGovernors();

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

            const epsilon = BigInt(1);
            expect(await fundToken.balanceOf(addr1.getAddress())).to.be.closeTo(
                proposer1BalanceBeforePayout + proposer1Reward, epsilon);
            expect(await fundToken.balanceOf(addr2.getAddress())).to.be.closeTo(
                proposer2BalanceBeforePayout + proposer2Reward, epsilon);

            expect(await fundToken.balanceOf(owner.getAddress())).to.be.closeTo(
                governorBalanceBeforePayout + governorReward, epsilon);
        })

    })
    describe("Fund Token", function ()
    {
        it("Should add an asset to the fund token", async function ()
        {
            if (network.network.name !== "hardhat")
            {
                this.skip();
            }
            const { fundToken, fundController,
                wethMock, wethMockAggregator,
                cbBTCMock, cbBTCMockAggregator} = await loadFixture(contractDeploymentLocalFixture);


            await addAssetToFund(fundController, fundToken, await wethMock.getAddress(), await wethMockAggregator.getAddress());
            // now add another asset
            await addAssetToFund(fundController, fundToken, await cbBTCMock.getAddress(), await cbBTCMockAggregator.getAddress());

        })
    })
});
