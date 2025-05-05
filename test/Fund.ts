import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";


const oneDay = 24n * 60n * 60n;
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
               [initialEpochTime, initialPercentageFeeProposers, initialPercentageFeeGovernors, await usdcMock.getAddress()]);

        await fundController.waitForDeployment();

        expect(await fundController.s_epochTime()).to.equal(initialEpochTime);
        expect(await fundController.s_proposalPercentageReward()).to.equal(initialPercentageFeeProposers);
        expect(await fundController.s_governorPercentrageReward()).to.equal(initialPercentageFeeGovernors);

        const fundToken = await hre.ethers.deployContract("FundToken",
            [await fundController.getAddress(), await usdcMock.getAddress(), await usdcMockAggregator.getAddress()]);
        await fundToken.waitForDeployment();

        // check the base asset
        let assets = await fundToken.getAssets();
        expect(assets.length).to.equal(1);
        expect(assets[0].token).to.equal(await usdcMock.getAddress());
        expect(assets[0].aggregator).to.equal(await usdcMockAggregator.getAddress());

        fundController.initialize(await fundToken.getAddress());

        return { owner, fundToken, fundController, usdcMock, usdcMockAggregator };
        
    }

    describe("Initialization", function ()
    {
        it("Should deploy the contracts correctly", async function ()
        {
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

            // set the new percentage fee for the governors to 2%
            const newPercentageFeeGovernors = 3;
            await fundController.setGovernorPercentageReward(newPercentageFeeGovernors);
            // check the new percentage fee for the governors
            expect(await fundController.s_governorPercentrageReward()).to.equal(newPercentageFeeGovernors);

        })
    })
    describe("Fund Token", function ()
    {
        it("Should add an asset to the fund token", async function ()
        {
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
    })
});
