import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";
import network from "hardhat"
import { IERC20Extended } from "../typechain-types";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

const oneDay = 24n * 60n * 60n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
describe("Fund Functionalities", function ()
{
    async function contractDeploymentFixture()
    {
        const [owner] = await hre.ethers.getSigners();

        const usdcMockTotalSupply = 1000000000n;
        const usdcMockDecimals = 6n
        const usdcMock = await hre.ethers.deployContract("GenericERC20Mock",
                    ["USDC Mock", "USDM", usdcMockDecimals, usdcMockTotalSupply]);
        await usdcMock.waitForDeployment();

        // check the initial supply of the mock usdc
        expect(await usdcMock.totalSupply()).to.equal(usdcMockTotalSupply * 10n ** usdcMockDecimals);

        // get a usdc mock aggregator
        const usdcMockAggregatorDecimals = 8n;
        const usdcMockAggregatorInitialAnswer = 1n * 10n ** usdcMockAggregatorDecimals;
        const usdcMockAggregator = await hre.ethers.deployContract("MockV3Aggregator",
            [usdcMockAggregatorDecimals, usdcMockAggregatorInitialAnswer]);
        await usdcMockAggregator.waitForDeployment();

        expect(await usdcMockAggregator.decimals()).to.equal(usdcMockAggregatorDecimals);

        const initialEpochTime = oneDay;
        const initialPercentageFeeProposers = 1;
        const initialPercentageFeeGovernors = 1;
        const fundController = await hre.ethers.deployContract("FundController",
               [initialEpochTime, initialPercentageFeeProposers, initialPercentageFeeGovernors,
                   await usdcMock.getAddress(), ZERO_ADDRESS]); // ZERO_ADDRESS for now

        await fundController.waitForDeployment();

        expect(await fundController.s_epochTime()).to.equal(initialEpochTime);
        expect(await fundController.s_proposalPercentageReward()).to.equal(initialPercentageFeeProposers);
        expect(await fundController.s_governorPercentrageReward()).to.equal(initialPercentageFeeGovernors);

        const fundToken = await hre.ethers.deployContract("FundToken",
            [await fundController.getAddress(), await usdcMock.getAddress(), await usdcMockAggregator.getAddress(),
            ZERO_ADDRESS]);
        await fundToken.waitForDeployment();

        // check the base asset
        let assets = await fundToken.getAssets();
        expect(assets.length).to.equal(1);
        expect(assets[0].token).to.equal(await usdcMock.getAddress());
        expect(assets[0].aggregator).to.equal(await usdcMockAggregator.getAddress());

        await fundController.initialize(await fundToken.getAddress());

        return { owner, fundToken, fundController, usdcMock, usdcMockAggregator };
        
    }

    async function contractDeploymentForkedFixture()
    {
        const [owner] = await hre.ethers.getSigners();

        const usdcAddress_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        const usdcAggregatorAddress_BASE = "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B";
        // const usdcAggregator_BASE = await hre.ethers.getContractAt("AggregatorV3Interface", usdcAggregatorAddress_BASE);

        const uniswapRouterAddress_BASE = "0x2626664c2603336E57B271c5C0b26F421741e481";

        const initialEpochTime = oneDay;
        const initialPercentageFeeProposers = 1;
        const initialPercentageFeeGovernors = 1;
        const fundController = await hre.ethers.deployContract("FundController",
               [initialEpochTime, initialPercentageFeeProposers, initialPercentageFeeGovernors,
                   usdcAddress_BASE, uniswapRouterAddress_BASE]); // ZERO_ADDRESS for now

        await fundController.waitForDeployment();

        expect(await fundController.s_epochTime()).to.equal(initialEpochTime);
        expect(await fundController.s_proposalPercentageReward()).to.equal(initialPercentageFeeProposers);
        expect(await fundController.s_governorPercentrageReward()).to.equal(initialPercentageFeeGovernors);

        const fundToken = await hre.ethers.deployContract("FundToken",
            [await fundController.getAddress(), usdcAddress_BASE, usdcAggregatorAddress_BASE,
            uniswapRouterAddress_BASE]);
        await fundToken.waitForDeployment();

        // check the base asset
        let assets = await fundToken.getAssets();
        expect(assets.length).to.equal(1);
        expect(assets[0].token).to.equal(usdcAddress_BASE);
        expect(assets[0].aggregator).to.equal(usdcAggregatorAddress_BASE);

        await fundController.initialize(await fundToken.getAddress());

        return { owner, fundToken, fundController };
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
            const ethUsdcMockAggregatorDecimals = 8n;
            const ethUsdcMockAggregatorInitialAnswer = 1800n * 10n ** ethUsdcMockAggregatorDecimals;
            const ethUsdcMockAggregator = await hre.ethers.deployContract("MockV3Aggregator",
                [ethUsdcMockAggregatorDecimals, ethUsdcMockAggregatorInitialAnswer]);
            await ethUsdcMockAggregator.waitForDeployment();

            expect(await ethUsdcMockAggregator.decimals()).to.equal(ethUsdcMockAggregatorDecimals);
            const firstRoundData = await ethUsdcMockAggregator.latestRoundData();

            // the round number
            expect(firstRoundData[0]).to.equal(1);

            // the answer
            expect(firstRoundData[1]).to.equal(ethUsdcMockAggregatorInitialAnswer);

            // save the start time
            const startTime = firstRoundData[2];

            // on initialization the start time and update time are the same
            expect(startTime).to.equal(firstRoundData[3]);

            const newEthPrice = 2000n
            await ethUsdcMockAggregator.updateAnswer(newEthPrice * 10n ** ethUsdcMockAggregatorDecimals);

            const secondRoundData = await ethUsdcMockAggregator.latestRoundData();

            // the round number
            expect(secondRoundData[0]).to.equal(2);

            // the answer
            expect(secondRoundData[1]).to.equal(newEthPrice * 10n ** ethUsdcMockAggregatorDecimals);
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
            const newEpochTime = 2n * oneDay;
            await fundController.setEpochTime(newEpochTime);
            // now check the new epoch time
            expect(await fundController.s_epochTime()).to.equal(newEpochTime);

            // set the new percentage fee for the proposers to 2%
            const newPercentageFeeProposers = 2;
            await fundController.setProposalPercentageReward(newPercentageFeeProposers);
            // check the new percentage fee for the proposers
            expect(await fundController.s_proposalPercentageReward()).to.equal(newPercentageFeeProposers);

            // set the new percentage fee for the governors to 3%
            const newPercentageFeeGovernors = 3;
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
            
            const AmountToSendOwner = 1000n;
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
            const { fundToken, fundController, usdcMock, usdcMockAggregator } = await loadFixture(contractDeploymentFixture);

            const wethMockTotalSupply = 1000000000n;
            const wethMockDecimals = 18n
            const wethMock = await hre.ethers.deployContract("GenericERC20Mock",
                        ["WETH Mock", "WETHM", wethMockDecimals, wethMockTotalSupply]);
            await wethMock.waitForDeployment();

            // get a usdc mock aggregator
            const wethMockAggregatorDecimals = 8n;
            const wethMockAggregatorInitialAnswer = 1n * 10n ** wethMockAggregatorDecimals;
            const wethMockAggregator = await hre.ethers.deployContract("MockV3Aggregator",
                [wethMockAggregatorDecimals, wethMockAggregatorInitialAnswer]);
            await wethMockAggregator.waitForDeployment();

            await fundController.addAssetToFund(await wethMock.getAddress(), await wethMockAggregator.getAddress());

            // check if the fund token has the asset
            let assets = await fundToken.getAssets();
            expect(assets.length).to.equal(2);
            expect(assets[0].token).to.equal(await usdcMock.getAddress());
            expect(assets[0].aggregator).to.equal(await usdcMockAggregator.getAddress());
            expect(assets[1].token).to.equal(await wethMock.getAddress());
            expect(assets[1].aggregator).to.equal(await wethMockAggregator.getAddress());

            // now add another asset
            const wbtcMockTotalSupply = 1000000000n;
            const wbtcMockDecimals = 18n
            const wbtcMock = await hre.ethers.deployContract("GenericERC20Mock",
                        ["WBTC Mock", "WBTCM", wbtcMockDecimals, wbtcMockTotalSupply]);
            await wbtcMock.waitForDeployment();

            // get a usdc mock aggregator
            const wbtcMockAggregatorDecimals = 8n;
            const wbtcMockAggregatorInitialAnswer = 1n * 10n ** wbtcMockAggregatorDecimals;
            const wbtcMockAggregator = await hre.ethers.deployContract("MockV3Aggregator",
                [wbtcMockAggregatorDecimals, wbtcMockAggregatorInitialAnswer]);
            await wbtcMockAggregator.waitForDeployment();

            await fundController.addAssetToFund(await wbtcMock.getAddress(), await wbtcMockAggregator.getAddress());

            // check if the fund token has the asset
            assets = await fundToken.getAssets();
            expect(assets[0].token).to.equal(await usdcMock.getAddress());
            expect(assets[0].aggregator).to.equal(await usdcMockAggregator.getAddress());
            expect(assets[1].token).to.equal(await wethMock.getAddress());
            expect(assets[1].aggregator).to.equal(await wethMockAggregator.getAddress());
            expect(assets[2].token).to.equal(await wbtcMock.getAddress());
            expect(assets[2].aggregator).to.equal(await wbtcMockAggregator.getAddress());
        })
        it("Should preform a swap correctly", async function ()
        {
            const latestBlock = await hre.ethers.provider.getBlock("latest");
            if(network.network.name !== "localhost" || latestBlock.number < 20000)
            {
                this.skip();
            }
            // this mine(1) needs to be here, it is an odd bug with hardhat
            await mine(1);
            const { owner, fundToken, fundController } = await loadFixture(contractDeploymentForkedFixture);
           
            // console.log(await hre.ethers.provider.getBlock("latest"));

            const cbBTCWhaleAddress_BASE = "0xBdb9300b7CDE636d9cD4AFF00f6F009fFBBc8EE6";
            const wETHWhaleAddress_BASE = "0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7";
            const usdcWhaleAddress_BASE = "0x0B0A5886664376F59C351ba3f598C8A8B4D0A6f3";

            // impersonate the whales
            const cbBTCWhaleSigner = await hre.ethers.getImpersonatedSigner(cbBTCWhaleAddress_BASE);
            const wETHWhaleSigner = await hre.ethers.getImpersonatedSigner(wETHWhaleAddress_BASE);
            const usdcWhaleSigner = await hre.ethers.getImpersonatedSigner(usdcWhaleAddress_BASE);

            const cbBTCaddress_BASE = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
            const wETHAddress_BASE = "0x4200000000000000000000000000000000000006";
            const usdcAddress_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

            // aggregator addresses:
            const cbBTCAggregatorAddress_BASE = "0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D";
            // TODO: This is really the ETH/USD aggregator, I couldn't find the wETH aggregator
            // We need to check if this will make a difference
            const wETHAggregatorAddress_BASE = "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70";
            const usdcAggregatorAddress_BASE = "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B";

            // get the contracts
            const cbBTC = await hre.ethers.getContractAt("IERC20Extended", cbBTCaddress_BASE);
            const wETH = await hre.ethers.getContractAt("IERC20Extended", wETHAddress_BASE);
            const usdc = await hre.ethers.getContractAt("IERC20Extended", usdcAddress_BASE);

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


            // now mint the fund token
            const amountToSpend = 100000n;
            await usdc.connect(owner).approve(await fundController.getAddress(),
                amountToSpend * 10n ** await usdc.decimals());

            // check that the allowance updated correctly
            expect(await usdc.allowance(owner.address, await fundController.getAddress())).to.equal(
                amountToSpend * 10n ** await usdc.decimals());

            // now we can mint the fund token
            // first let's check that the total total supply
            // of the fund token is 0
            expect(await fundToken.totalSupply()).to.equal(0n);
            
            await fundController.issueStableCoin(amountToSpend * 10n ** await usdc.decimals());

            expect(await fundToken.totalSupply()).to.equal(amountToSpend * 10n ** await fundToken.decimals());

            // check the fund token balance of the minter
            expect(await fundToken.balanceOf(owner.address)).to.equal(amountToSpend * 10n ** await fundToken.decimals());

            // check that the fund token has received usdc
            expect(await usdc.balanceOf(fundToken.getAddress())).to.equal(amountToSpend * 10n ** await usdc.decimals());


            await fundController.addAssetToFund(await wETH.getAddress(), wETHAggregatorAddress_BASE);
            await fundController.addAssetToFund(await cbBTC.getAddress(), cbBTCAggregatorAddress_BASE);

            let assets = await fundToken.getAssets();
            expect(assets[0].token).to.equal(await usdc.getAddress());
            expect(assets[0].aggregator).to.equal(usdcAggregatorAddress_BASE);
            expect(assets[1].token).to.equal(await wETH.getAddress());
            expect(assets[1].aggregator).to.equal(wETHAggregatorAddress_BASE);
            expect(assets[2].token).to.equal(await cbBTC.getAddress());
            expect(assets[2].aggregator).to.equal(cbBTCAggregatorAddress_BASE);

            // now we can swap the tokens
            // we will swap usdc for cbBTC
            
            // first check that the fund token has no cbBTC
            expect(await cbBTC.balanceOf(fundToken.getAddress())).to.equal(0n);

            // now swap
            // const uniswapRouterAddress_BASE = "0x2626664c2603336E57B271c5C0b26F421741e481";
            // const fundTokenSigner = await hre.ethers.getImpersonatedSigner(await fundToken.getAddress());
            // await usdc.connect(fundTokenSigner).approve(uniswapRouterAddress_BASE, 1000000000000n);

            const amountOfUSDCBeforeSwap = await usdc.balanceOf(fundToken.getAddress());
            const amountOfUSDCToSwap = amountToSpend - 150n;

            await fundController.swapAsset(usdcAddress_BASE, cbBTCaddress_BASE,
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
