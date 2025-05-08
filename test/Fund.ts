import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import network from "hardhat"
import { mine } from "@nomicfoundation/hardhat-network-helpers";

import {miscConstants, baseMainnetConstants,
usdcMockConstants, wethMockConstants, cbBTCMockConstants,
usdcAggregatorMockConstants, ethAggregatorMockConstants,
wethAggregatorMockConstants, cbBTCAggregatorMockConstants,
fundControllerConstants} from "./utils/constants";

import {GenericERC20Mock, FundToken, FundController, IERC20Extended, IERC20Extended__factory} from "../typechain-types/";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

require("dotenv").config();

// at block 29878423 on base:
// eth price: ~$1800
// cbBTC price: ~$95,000

describe("Fund Functionalities", function ()
{
    async function resetForkedNetwork()
    {
        await hre.network.provider.request({
            method: "hardhat_reset",
            params: [
            {
                forking: {
                    jsonRpcUrl: process.env.ALCHEMY_URL + process.env.ALCHEMY_API_KEY,
                    blockNumber: Number(process.env.BASE_MAINNET_BLOCK_TO_FORK),
                },
              },
            ],
          });
    }
    async function contractDeploymentFixture()
    {
        const [owner] = await hre.ethers.getSigners();

        const usdcMock = await hre.ethers.deployContract("GenericERC20Mock",
                    [usdcMockConstants.name, usdcMockConstants.symbol,
                    usdcMockConstants.decimals, usdcMockConstants.totalSupply]);
        await usdcMock.waitForDeployment();

        // check the initial supply of the mock usdc
        expect(await usdcMock.totalSupply()).to.equal(
            usdcMockConstants.totalSupply * 10n ** usdcMockConstants.decimals);

        const usdcMockAggregator = await hre.ethers.deployContract("MockV3Aggregator",
            [usdcAggregatorMockConstants.decimals,
            usdcAggregatorMockConstants.initialAnswer * 10n ** usdcAggregatorMockConstants.decimals]);
        await usdcMockAggregator.waitForDeployment();

        expect(await usdcMockAggregator.decimals()).to.equal(usdcAggregatorMockConstants.decimals);

        const wethMock = await hre.ethers.deployContract("GenericERC20Mock",
                    [wethMockConstants.name, wethMockConstants.symbol,
                    wethMockConstants.decimals, wethMockConstants.totalSupply]);
        await wethMock.waitForDeployment();

        expect(await wethMock.totalSupply()).to.equal(
            wethMockConstants.totalSupply * 10n ** wethMockConstants.decimals);

        // get a wETH/usd mock aggregator
        const wethMockAggregator = await hre.ethers.deployContract("MockV3Aggregator",
            [wethAggregatorMockConstants.decimals,
            wethAggregatorMockConstants.initialAnswer * 10n ** wethAggregatorMockConstants.decimals]);
        await wethMockAggregator.waitForDeployment();

        expect(await wethMockAggregator.decimals()).to.equal(wethAggregatorMockConstants.decimals);

        // get a cbBTC mock
        const cbBTCMock = await hre.ethers.deployContract("GenericERC20Mock",
                    [cbBTCMockConstants.name, cbBTCMockConstants.symbol,
                    cbBTCMockConstants.decimals, cbBTCMockConstants.totalSupply]);
        await cbBTCMock.waitForDeployment();

        expect(await cbBTCMock.totalSupply()).to.equal(
            cbBTCMockConstants.totalSupply * 10n ** cbBTCMockConstants.decimals);

        // get a usdc mock aggregator
        const cbBTCMockAggregator = await hre.ethers.deployContract("MockV3Aggregator",
            [cbBTCAggregatorMockConstants.decimals,
            cbBTCAggregatorMockConstants.initialAnswer * 10n ** cbBTCMockConstants.decimals]);
        await cbBTCMockAggregator.waitForDeployment();
        expect(await cbBTCMockAggregator.decimals()).to.equal(cbBTCAggregatorMockConstants.decimals);


        const fundController = await hre.ethers.deployContract("FundController",
               [fundControllerConstants.initialEpochTime,
               fundControllerConstants.initialPercentageFeeProposers,
               fundControllerConstants.initialPercentageFeeGovernors,
               await usdcMock.getAddress(), miscConstants.ZERO_ADDRESS]); // ZERO_ADDRESS for now

        await fundController.waitForDeployment();

        expect(await fundController.s_epochTime()).to.equal(
            fundControllerConstants.initialEpochTime);
        expect(await fundController.s_proposalPercentageReward()).to.equal(
            fundControllerConstants.initialPercentageFeeProposers);
        expect(await fundController.s_governorPercentrageReward()).to.equal(
            fundControllerConstants.initialPercentageFeeGovernors);

        const fundToken = await hre.ethers.deployContract("FundToken",
            [await fundController.getAddress(), await usdcMock.getAddress(), await usdcMockAggregator.getAddress(),
            miscConstants.ZERO_ADDRESS]);   // ZERO_ADDRESS because this is for unit tests
        await fundToken.waitForDeployment();

        // check the base asset
        let assets = await fundToken.getAssets();
        expect(assets.length).to.equal(1);
        expect(assets[0].token).to.equal(await usdcMock.getAddress());
        expect(assets[0].aggregator).to.equal(await usdcMockAggregator.getAddress());

        await fundController.initialize(await fundToken.getAddress());

        return { owner, fundToken, fundController, usdcMock, usdcMockAggregator,
                 wethMock, wethMockAggregator, cbBTCMock, cbBTCMockAggregator };
        
    }

    async function contractDeploymentForkedFixture()
    {
        await resetForkedNetwork();
        await mine(1);
        const [owner, addr1, addr2] = await hre.ethers.getSigners();

        const fundController = await hre.ethers.deployContract("FundController",
               [fundControllerConstants.initialEpochTime,
               fundControllerConstants.initialPercentageFeeProposers,
               fundControllerConstants.initialPercentageFeeGovernors,
               baseMainnetConstants.usdcAddress, baseMainnetConstants.uniswapRouterAddress]);

        await fundController.waitForDeployment();

        expect(await fundController.s_epochTime()).to.equal(
            fundControllerConstants.initialEpochTime);
        expect(await fundController.s_proposalPercentageReward()).to.equal(
            fundControllerConstants.initialPercentageFeeProposers);
        expect(await fundController.s_governorPercentrageReward()).to.equal(
            fundControllerConstants.initialPercentageFeeGovernors);

        const fundToken = await hre.ethers.deployContract("FundToken",
            [await fundController.getAddress(), baseMainnetConstants.usdcAddress, baseMainnetConstants.usdcAggregatorAddress,
            baseMainnetConstants.uniswapRouterAddress]);
        await fundToken.waitForDeployment();

        // check the base asset
        let assets = await fundToken.getAssets();
        expect(assets.length).to.equal(1);
        expect(assets[0].token).to.equal(baseMainnetConstants.usdcAddress);
        expect(assets[0].aggregator).to.equal(baseMainnetConstants.usdcAggregatorAddress);

        await fundController.initialize(await fundToken.getAddress());

        // impersonate the whales
        const cbBTCWhaleSigner = await hre.ethers.getImpersonatedSigner(baseMainnetConstants.cbBTCWhaleAddress);
        const wETHWhaleSigner = await hre.ethers.getImpersonatedSigner(baseMainnetConstants.wETHWhaleAddress);
        const usdcWhaleSigner = await hre.ethers.getImpersonatedSigner(baseMainnetConstants.usdcWhaleAddress);

        // get the contracts
        const cbBTC: IERC20Extended = await hre.ethers.getContractAt("IERC20Extended", baseMainnetConstants.cbBTCAddress);
        const wETH: IERC20Extended = await hre.ethers.getContractAt("IERC20Extended", baseMainnetConstants.wETHAddress);
        const usdc: IERC20Extended = await hre.ethers.getContractAt("IERC20Extended", baseMainnetConstants.usdcAddress);

        // send some tokens to the owner
        const AmountToSendOwner_cbBTC = 2n;
        const AmountToSendOwner_wETH = 5n;
        const AmountToSendOwner_usdc = 100000000n;
        await cbBTC.connect(cbBTCWhaleSigner).transfer(owner.address,
            AmountToSendOwner_cbBTC * 10n ** await cbBTC.decimals());
        await wETH.connect(wETHWhaleSigner).transfer(owner.address,
            AmountToSendOwner_wETH * 10n ** await wETH.decimals());
        await usdc.connect(usdcWhaleSigner).transfer(owner.address,
            AmountToSendOwner_usdc * 10n ** await usdc.decimals());

        // check that the balance of the owner is correct
        expect(await cbBTC.balanceOf(owner.address)).to.equal(
            AmountToSendOwner_cbBTC * 10n ** await cbBTC.decimals());
        expect(await wETH.balanceOf(owner.address)).to.equal(
            AmountToSendOwner_wETH * 10n ** await wETH.decimals());
        expect(await usdc.balanceOf(owner.address)).to.equal(
            AmountToSendOwner_usdc * 10n ** await usdc.decimals());

        return { owner, addr1, addr2, fundToken, fundController, cbBTC, wETH, usdc};
    }

    async function mintFromStableCoin_MOCK(usdcMock: GenericERC20Mock,
                                      owner: SignerWithAddress,
                                      fundToken: FundToken,
                                      fundController: FundController,
                                      AmountToSendOwner: bigint)
    {
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
        
        await fundController.issueStableCoin(AmountToSendOwner * 10n ** await usdcMock.decimals());

        // check the fund token total supply
        // NOTE: for the initial mint 1 fund token = 1 usdc
        expect(await fundToken.totalSupply()).to.equal(AmountToSendOwner * 10n ** await fundToken.decimals());

        // check the fund token balance of the minter
        expect(await fundToken.balanceOf(owner.address)).to.equal(AmountToSendOwner * 10n ** await fundToken.decimals());

        // check that the fund token has received usdc 
        expect(await usdcMock.balanceOf(fundToken.getAddress())).to.equal(AmountToSendOwner * 10n ** await usdcMock.decimals());
        
    }


    async function mintFromStableCoin_INTEGRATION(usdc: IERC20Extended,
                                      owner: SignerWithAddress,
                                      fundToken: FundToken,
                                      fundController: FundController,
                                      AmountToSendOwner: bigint)
    {
        // now in order to mint we need to approve the fund Controller to spend
        // on our behalf
        await usdc.connect(owner).approve(await fundController.getAddress(),
            AmountToSendOwner * 10n ** await usdc.decimals());

        // check that the allowance updated correctly
        expect(await usdc.allowance(owner.address, await fundController.getAddress())).to.equal(
            AmountToSendOwner * 10n ** await usdc.decimals());

        // now we can mint the fund token
        // first let's check that the total total supply
        // of the fund token is 0
        expect(await fundToken.totalSupply()).to.equal(0n);
        
        await fundController.issueStableCoin(AmountToSendOwner * 10n ** await usdc.decimals());

        // check the fund token total supply
        // NOTE: for the initial mint 1 fund token = 1 usdc
        expect(await fundToken.totalSupply()).to.equal(AmountToSendOwner * 10n ** await fundToken.decimals());

        // check the fund token balance of the minter
        expect(await fundToken.balanceOf(owner.address)).to.equal(AmountToSendOwner * 10n ** await fundToken.decimals());

        // check that the fund token has received usdc 
        expect(await usdc.balanceOf(fundToken.getAddress())).to.equal(AmountToSendOwner * 10n ** await usdc.decimals());
        
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

        console.log("Amount of USDC in the fund before swap:" + await assetToTrade.balanceOf(await fundToken.getAddress()));

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
            const { owner, fundToken, fundController } = await loadFixture(contractDeploymentFixture);

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
            // console.log(network.network.config.chainId);
            if (network.network.name !== "hardhat")
            {
                this.skip();
            }
            const { fundController } = await loadFixture(contractDeploymentFixture);

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
            expect(await fundController.s_governorPercentrageReward()).to.equal(newPercentageFeeGovernors);

        })
        it("Should mint the fund token correctly: single token", async function ()
        {
            if (network.network.name !== "hardhat")
            {
                this.skip();
            }
            const { owner, fundToken, fundController, usdcMock } = await loadFixture(contractDeploymentFixture);
            console.log("About to call the mint function")
            const AmountToSendOwner = 1000n;
            await mintFromStableCoin_MOCK(usdcMock, owner, fundToken, fundController, AmountToSendOwner); 

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
            await mintFromStableCoin_INTEGRATION(usdc, owner, fundToken, fundController, amountToSpend);

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
            createProposal(fundController, await wETH.getAddress(), await usdc.getAddress(),
                amountOfWETHToSpendOnProposal_RAW, addr1);
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
                cbBTCMock, cbBTCMockAggregator} = await loadFixture(contractDeploymentFixture);


            await addAssetToFund(fundController, fundToken, await wethMock.getAddress(), await wethMockAggregator.getAddress());
            // now add another asset
            await addAssetToFund(fundController, fundToken, await cbBTCMock.getAddress(), await cbBTCMockAggregator.getAddress());

        })
        it("Should preform a swap correctly", async function ()
        {
            // await resetForkedNetwork();
            // this mine(1) needs to be here, as a result of an odd bug with hardhat
            // await mine(1);
            const latestBlock = await hre.ethers.provider.getBlock("latest");
            if(network.network.name !== "localhost" || latestBlock.number < 20000)
            {
                this.skip();
            }
            const { owner, fundToken, fundController, cbBTC, wETH, usdc } = await loadFixture(contractDeploymentForkedFixture);

            // now mint the fund token
            const amountToSpend = 100000n;
            await mintFromStableCoin_INTEGRATION(usdc, owner, fundToken, fundController, amountToSpend);

            await addAssetToFund(fundController, fundToken, await wETH.getAddress(), baseMainnetConstants.wETHAggregatorAddress);
            await addAssetToFund(fundController, fundToken, await cbBTC.getAddress(), baseMainnetConstants.cbBTCAggregatorAddress);

            // now we can swap the tokens
            // we will swap usdc for cbBTC
            
            // first check that the fund token has no cbBTC
            expect(await cbBTC.balanceOf(fundToken.getAddress())).to.equal(0n);

            // now swap
            const amountOfUSDCBeforeSwap = await usdc.balanceOf(fundToken.getAddress());
            const amountOfUSDCToSwap = amountToSpend - 150n;

            await fundController.swapAsset(baseMainnetConstants.usdcAddress, baseMainnetConstants.cbBTCAddress,
                                           amountOfUSDCToSwap * 10n ** await usdc.decimals());

            // check that the fund token spent the usdc
            expect(await usdc.balanceOf(fundToken.getAddress())).to.equal(
                amountOfUSDCBeforeSwap - amountOfUSDCToSwap * 10n ** await usdc.decimals());

            // check that the fund token received the cbBTC
            // TODO: have a better way to test this, here we should 
            // receive 1 cbBTC for 100,000 usdc because of the block we
            // are forking at, if we change the block number and the price
            // falls, this test will fail
            expect(await cbBTC.balanceOf(fundToken.getAddress())).to.be.greaterThan(1n ** 10n ** await cbBTC.decimals());

        })
    })
});
