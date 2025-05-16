import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import network from "hardhat"

import {miscConstants, baseMainnetConstants,
ethAggregatorMockConstants, wethAggregatorMockConstants,
fundControllerConstants} from "./utils/constants";

import { contractDeploymentLocalFixture,
contractDeploymentForkedFixture } from "./utils/fixtures";

import { GenericERC20Mock, FundToken, FundController, IERC20Extended } from "../typechain-types/";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";


// at block 29878423 on base:
// eth price: ~$1800
// cbBTC price: ~$95,000

const epsilon = BigInt(1);
describe("Fund Functionalities", function ()
{
    async function mintFromStableCoin_MOCK(usdcMock: GenericERC20Mock,
                                      owner: SignerWithAddress,
                                      fundToken: FundToken,
                                      fundController: FundController,
                                      AmountToSendOwner: bigint)
    {

        const initialMintingRate = 10n ** 2n;
        const usdcMockContractSigner = await hre.ethers.getImpersonatedSigner(await usdcMock.getAddress());
        await usdcMock.connect(usdcMockContractSigner).transfer(owner.address,
                     AmountToSendOwner * 10n ** await usdcMock.decimals());
        
        // check the balance of the usdcMock contract that the transfer left
        // its wallet
        expect(await usdcMock.balanceOf(usdcMockContractSigner.address)).to.equal(
            await usdcMock.totalSupply() - AmountToSendOwner * 10n ** await usdcMock.decimals());

        // now check the owner's balance
        expect(await usdcMock.balanceOf(owner.address)).to.equal(AmountToSendOwner * 10n ** await usdcMock.decimals());

        // now in order to mint we need to approve the fund Controller to spend
        // on our behalf
        await usdcMock.connect(owner).approve(await fundController.getAddress(),
            AmountToSendOwner * 10n ** await usdcMock.decimals());

        // check that the allowance updated correctly
        expect(await usdcMock.allowance(owner.address, await fundController.getAddress())).to.equal(
            AmountToSendOwner * 10n ** await usdcMock.decimals());

        // now we can mint the fund token
        // first let's check that the total total supply
        // of the fund token is 0
        expect(await fundToken.totalSupply()).to.equal(0n);
        
        await fundController.issueUsingStableCoin(AmountToSendOwner * 10n ** await usdcMock.decimals());

        // check the fund token total supply
        // NOTE: for the initial mint 1 fund token = 1 usdc
        expect(await fundToken.totalSupply()).to.equal(AmountToSendOwner * 10n ** await fundToken.decimals() / initialMintingRate);

        // check the fund token balance of the minter
        expect(await fundToken.balanceOf(owner.address)).to.equal(AmountToSendOwner * 10n ** await fundToken.decimals() / initialMintingRate);

        // check that the fund token has received usdc 
        expect(await usdcMock.balanceOf(fundToken.getAddress())).to.equal(AmountToSendOwner * 10n ** await usdcMock.decimals());
        
    }


    async function mintFromStableCoin_INTEGRATION(usdc: IERC20Extended,
                                      usdcAggregatorAddress: string,
                                      owner: SignerWithAddress,
                                      fundToken: FundToken,
                                      fundController: FundController,
                                      AmountToSendOwner: bigint)
    {
        // now in order to mint we need to approve the fund Controller to spend
        // on our behalf
        const usdcAggregator = await hre.ethers.getContractAt("@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol:AggregatorV3Interface", usdcAggregatorAddress);
        await usdc.connect(owner).approve(await fundController.getAddress(),
            AmountToSendOwner * 10n ** await usdc.decimals());

        // check that the allowance updated correctly
        expect(await usdc.allowance(owner.address, await fundController.getAddress())).to.equal(
            AmountToSendOwner * 10n ** await usdc.decimals());

        const fTokenTotalSupplyBeforeMint = await fundToken.totalSupply();
        const ownerfTokenBalanceBeforeMint = await fundToken.balanceOf(owner.address);
        const fundUSDCBalanceBeforeMint = await usdc.balanceOf(fundToken.getAddress());
        
        let amountToMint = 0n;
        if (await fundToken.totalSupply() == 0n)
        {
            const usdcAggregatorData = await usdcAggregator.latestRoundData()
            const dollarToUSD = usdcAggregatorData[1];
            const unitConversion = 10n ** 10n;
            amountToMint = (AmountToSendOwner * (10n ** await usdc.decimals()) * dollarToUSD * unitConversion) / (10n ** await usdcAggregator.decimals());
        }
        else
        {
            // the additional 2n is for 10**2 which is the initial unit conversion
            const usdcAggregatorData = await usdcAggregator.latestRoundData()
            const dollarToUSD = usdcAggregatorData[1];
            amountToMint = (AmountToSendOwner * 10n ** await usdc.decimals() *
            dollarToUSD * fTokenTotalSupplyBeforeMint) /
            (await fundToken.getTotalValueOfFund() *
            10n ** await usdcAggregator.decimals())
        }
        await fundController.connect(owner).issueUsingStableCoin(AmountToSendOwner * 10n ** await usdc.decimals());

        expect(await fundToken.totalSupply()).to.equal(fTokenTotalSupplyBeforeMint + amountToMint);

        // check the fund token balance of the minter
        expect(await fundToken.balanceOf(owner.address)).to.equal(ownerfTokenBalanceBeforeMint + amountToMint);


        // check that the fund token has received usdc 
        expect(await usdc.balanceOf(fundToken.getAddress())).to.equal(fundUSDCBalanceBeforeMint + 
            AmountToSendOwner * 10n ** await usdc.decimals());
        
    }


    async function addAssetToFund(fundController: FundController,
                                fundToken: FundToken,
                                assetAddress: string,
                                assetAggregatorAddress: string)
    {
        const assetsBefore = await fundToken.getAssets();
        await fundController.addAssetToFund(assetAddress, assetAggregatorAddress);

        // check if the fund token has the asset
        const assetsAfter = await fundToken.getAssets();
        const newIndex = assetsBefore.length;

        expect(assetsAfter.length).to.equal(assetsBefore.length + 1);
        expect(assetsAfter[newIndex].token).to.equal(assetAddress);
        expect(assetsAfter[newIndex].aggregator).to.equal(assetAggregatorAddress);
    }

    async function createProposal(
        fundController: FundController,
        assetToTrade: string,
        assetToReceive: string,
        amountIn: bigint,
        proposer: SignerWithAddress)
    {
        const proposalsBefore = await fundController.getActiveProposals();
        await fundController.connect(proposer).createProposal(assetToTrade, assetToReceive, amountIn);
        const proposalsAfter = await fundController.getActiveProposals();
        const newIndex = proposalsBefore.length;

        expect(proposalsAfter.length).to.equal(proposalsBefore.length + 1);
        expect(proposalsAfter[newIndex].id).to.equal(newIndex + 1);
        expect(proposalsAfter[newIndex].proposer).to.equal(await proposer.getAddress());
        expect(proposalsAfter[newIndex].assetToTrade).to.equal(assetToTrade);
        expect(proposalsAfter[newIndex].assetToReceive).to.equal(assetToReceive);
        expect(proposalsAfter[newIndex].amountIn).to.equal(amountIn);
    }

    async function acceptProposal(proposalId: bigint,
                                 fundController: FundController,
                                 fundToken: FundToken,
                                 owner: SignerWithAddress,
                                 assetToTrade: IERC20Extended,
                                 assetToReceive: IERC20Extended)
    {
        const activeProposals = await fundController.getActiveProposals();
        let proposalToAccept = null;
        for (let i = 0; i < activeProposals.length; i++)
        {
            if(activeProposals[i].id === proposalId)
            {
                proposalToAccept = activeProposals[i];
                break;
            }
        }
        expect(proposalToAccept).to.not.equal(null);

        // TODO: This if statement is to suppress warnings
        // try to find a better way to do this
        if (proposalToAccept === null) {return;}

        const amountOfBaseAssetBeforeSwap = await assetToTrade.balanceOf(await fundToken.getAddress());
        const amountOfQuoteAssetBeforeSwap = await assetToReceive.balanceOf(await fundController.getAddress());

        await fundController.connect(owner).acceptProposal(proposalId);

        // check if the proposal went through
        expect(await assetToTrade.balanceOf(fundToken.getAddress())).to.equal(
            amountOfBaseAssetBeforeSwap - proposalToAccept.amountIn);

        // Right now we just check if the amount of the quote asset
        // received is greater than the amount of the quote asset in the fund
        // before the proposal got accepted
        // TODO: See if we can find a better way to test this
        expect(await assetToReceive.balanceOf(fundToken.getAddress())).
            to.be.greaterThan(amountOfQuoteAssetBeforeSwap ** 10n ** await assetToReceive.decimals());
    }

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
            const { owner, fundToken, fundController, usdcMock } = await loadFixture(contractDeploymentLocalFixture);
            const AmountToSendOwner = 1000n;
            await mintFromStableCoin_MOCK(usdcMock, owner, fundToken, fundController, AmountToSendOwner); 

        })
        it("Should mint the fund token correctly: multiple tokens, stable value", async function ()
        {
            const latestBlock = await hre.ethers.provider.getBlock("latest");
            if(network.network.name !== "localhost" || latestBlock.number < 20000)
            {
                this.skip();
            }

            const { owner, addr1, addr2, fundToken, fundController,
                cbBTC, wETH, usdc } = await loadFixture(contractDeploymentForkedFixture);

            // now mint the fund token
            const amountToMint1 = 100_000n;
            await mintFromStableCoin_INTEGRATION(usdc, baseMainnetConstants.usdcAggregatorAddress, owner, fundToken, fundController, amountToMint1);

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
            await mintFromStableCoin_INTEGRATION(usdc, baseMainnetConstants.usdcAggregatorAddress, addr1, fundToken, fundController, amountToMint2);
        })
        it("Should mint the fund token correctly: multiple tokens, volitile value", async function ()
        {
            const latestBlock = await hre.ethers.provider.getBlock("latest");
            if(network.network.name !== "localhost" || latestBlock.number < 20000)
            {
                this.skip();
            }

            const { owner, addr1, addr2, fundToken, fundController,
                cbBTC, wETH, usdc } = await loadFixture(contractDeploymentForkedFixture);
            const wethMockAggregator = await hre.ethers.deployContract("MockV3Aggregator",
                        [wethAggregatorMockConstants.decimals,
                        wethAggregatorMockConstants.initialAnswer * 10n ** wethAggregatorMockConstants.decimals]);
            await wethMockAggregator.waitForDeployment();

            await addAssetToFund(fundController, fundToken, await wETH.getAddress(), await wethMockAggregator.getAddress());

            await mintFromStableCoin_INTEGRATION(usdc, baseMainnetConstants.usdcAggregatorAddress, owner, fundToken, fundController, 10_000n);

            await mintFromStableCoin_INTEGRATION(usdc, baseMainnetConstants.usdcAggregatorAddress, owner, fundToken, fundController, 10_000n);
            // move all of the funds assets into weth
            await createProposal(fundController, await usdc.getAddress(), await wETH.getAddress(), 20_000n * 10n ** await usdc.decimals(), addr1);
            await acceptProposal(1n, fundController, fundToken, owner, usdc, wETH);

            // now cut the fund in half
            await wethMockAggregator.updateAnswer(wethAggregatorMockConstants.initialAnswer * 10n ** wethAggregatorMockConstants.decimals / 2n);


            // now we test minting double as much fToken for the same price
            let totalSupplyBeforeMint = await fundToken.totalSupply();
            await mintFromStableCoin_INTEGRATION(usdc, baseMainnetConstants.usdcAggregatorAddress, owner, fundToken, fundController, 10_000n);


            // this one needs to be an approximation because now two assets are involved and
            // 1 USDC is not exactly equal to $1
            // if 1 USDC = exactly $1 this approximation would not be needed
            const epsilonMint = await fundToken.totalSupply() / 100n;
            expect(await fundToken.totalSupply()).to.be.closeTo(totalSupplyBeforeMint * 2n, epsilonMint);

            // now the total supply should be around 400 fToken

            await wethMockAggregator.updateAnswer(wethAggregatorMockConstants.initialAnswer * 10n ** wethAggregatorMockConstants.decimals * 2n);
            totalSupplyBeforeMint = await fundToken.totalSupply();
            const totalFundValueBeforeMint = await fundToken.getTotalValueOfFund();

            await mintFromStableCoin_INTEGRATION(usdc, baseMainnetConstants.usdcAggregatorAddress, owner, fundToken, fundController, 10_000n);
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
            const { owner, fundToken, fundController, usdcMock } = await loadFixture(contractDeploymentLocalFixture);
            const AmountToSendOwner = 100000n;
            await mintFromStableCoin_MOCK(usdcMock, owner, fundToken, fundController, AmountToSendOwner);

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

            const { owner, addr1, addr2, fundToken, fundController, cbBTC, wETH, usdc } = await loadFixture(contractDeploymentForkedFixture);

            // now mint the fund token
            const amountToSpend = 100_000n;
            await mintFromStableCoin_INTEGRATION(usdc, baseMainnetConstants.usdcAggregatorAddress, owner, fundToken, fundController, amountToSpend);

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

            const { owner, addr1, addr2, fundToken, fundController, cbBTC, wETH, usdc } = await loadFixture(contractDeploymentForkedFixture);

            // now mint the fund token
            const amountToSpend = 100000n;
            await mintFromStableCoin_INTEGRATION(usdc, baseMainnetConstants.usdcAggregatorAddress, owner, fundToken, fundController, amountToSpend);

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
            const { owner, addr1, fundToken, fundController, cbBTC, wETH, usdc } = await loadFixture(contractDeploymentForkedFixture);

            // now mint the fund token
            const amountToSpend = 100000n;
            await mintFromStableCoin_INTEGRATION(usdc, baseMainnetConstants.usdcAggregatorAddress, owner, fundToken, fundController, amountToSpend);

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
            const { owner, addr1, addr2, fundToken, fundController, cbBTC, wETH, usdc } = await loadFixture(contractDeploymentForkedFixture);
            const amountToSpend = 100_000n;
            await mintFromStableCoin_INTEGRATION(usdc, baseMainnetConstants.usdcAggregatorAddress, owner, fundToken, fundController, amountToSpend);

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
            const { owner, addr1, addr2, fundToken, fundController, cbBTC, wETH, usdc } = await loadFixture(contractDeploymentForkedFixture);
            const amountToSpend = 100_000n;
            await mintFromStableCoin_INTEGRATION(usdc, baseMainnetConstants.usdcAggregatorAddress, owner, fundToken, fundController, amountToSpend);

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
