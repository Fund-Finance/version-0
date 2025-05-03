import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";

describe("Fund Functionalities", function ()
{
    describe("Initialization", function ()
    {
        it("Should deploy the contracts correctly", async function ()
        {

            const [owner] = await hre.ethers.getSigners();

            const usdcMockTotalSupply = 1000000000n;
            const usdcMockDecimals = 6n
            const usdcMock = await hre.ethers.deployContract("GenericERC20Mock",
                        ["USDC Mock", "USDM", usdcMockDecimals, usdcMockTotalSupply]);
            await usdcMock.waitForDeployment();

            const oneDay = 24 * 60 * 60;
            const percentageFeeProposers = 1;
            const percentageFeeGovernors = 1;
            const fundController = await hre.ethers.deployContract("FundController",
                   [oneDay, percentageFeeProposers, percentageFeeGovernors, await usdcMock.getAddress()]);

            await fundController.waitForDeployment();

            const fundToken = await hre.ethers.deployContract("FundToken",[await fundController.getAddress()]);
            await fundToken.waitForDeployment();

            fundController.initialize(await fundToken.getAddress());

            // check the initial supply of the mock usdc
            expect(await usdcMock.totalSupply()).to.equal(usdcMockTotalSupply * 10n ** usdcMockDecimals);

            // check the ownership of the fund token
            expect(await fundToken.owner()).to.equal(await fundController.getAddress());

            // check the ownership of the fund fundController
            expect(await fundController.owner()).to.equal(await owner.getAddress());
         })
    })
});
