import hre from "hardhat";

import {miscConstants, baseMainnetConstants,
usdcMockConstants, wethMockConstants, cbBTCMockConstants,
usdcAggregatorMockConstants, wethAggregatorMockConstants,
cbBTCAggregatorMockConstants, fundControllerConstants} from "./constants";

import { expect } from "chai";

import {mine} from "@nomicfoundation/hardhat-toolbox/network-helpers";

import { IERC20Extended } from "../../typechain-types/";
require("dotenv").config();

/*************** HELPER FUNCTIONS FOR FIXTURES *******************/

/**
 * resetForkedNetwork
 * This function resets the forked network to a specific block number
 * it used the eviornment variables ALCHEMY_URL and ALCHEMY_API_KEY
 * from the .env file to connect to the Alchemy API and
 * BASE_MAINNET_BLOCK_TO_FORK to set the block number to fork from
 * the base mainnet
 */
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

/*************** FIXTURES FOR TESTING *******************/

/**
 * contractDeploymentLocalFixture
 * A fixture function that deploys the contracts for local testing
 * This includes core contracts (like the Fund Controller and Fund Token)
 * and mock contracts (like usdcMock)
 */
export async function contractDeploymentLocalFixture()
{
    const [owner] = await hre.ethers.getSigners();

    /************** DEPLOY MOCKS FOR LOCAL TESTING ******************/

    // deploy and test the usdc mock
    const usdcMock = await hre.ethers.deployContract("GenericERC20Mock",
                [usdcMockConstants.name, usdcMockConstants.symbol,
                usdcMockConstants.decimals, usdcMockConstants.totalSupply]);
    await usdcMock.waitForDeployment();

    expect(await usdcMock.totalSupply()).to.equal(
        usdcMockConstants.totalSupply * 10n ** usdcMockConstants.decimals);

    // deploy and test the USDC/USD mock aggregator
    const usdcMockAggregator = await hre.ethers.deployContract("MockV3Aggregator",
        [usdcAggregatorMockConstants.decimals,
        usdcAggregatorMockConstants.initialAnswer * 10n ** usdcAggregatorMockConstants.decimals]);
    await usdcMockAggregator.waitForDeployment();

    expect(await usdcMockAggregator.decimals()).to.equal(usdcAggregatorMockConstants.decimals);

    // deploy and test the wETH mock
    const wethMock = await hre.ethers.deployContract("GenericERC20Mock",
                [wethMockConstants.name, wethMockConstants.symbol,
                wethMockConstants.decimals, wethMockConstants.totalSupply]);
    await wethMock.waitForDeployment();

    expect(await wethMock.totalSupply()).to.equal(
        wethMockConstants.totalSupply * 10n ** wethMockConstants.decimals);

    // deploy and test the wETH/USD mock aggregator
    const wethMockAggregator = await hre.ethers.deployContract("MockV3Aggregator",
        [wethAggregatorMockConstants.decimals,
        wethAggregatorMockConstants.initialAnswer * 10n ** wethAggregatorMockConstants.decimals]);
    await wethMockAggregator.waitForDeployment();

    expect(await wethMockAggregator.decimals()).to.equal(wethAggregatorMockConstants.decimals);

    // deploy and test the cbBTC mock
    const cbBTCMock = await hre.ethers.deployContract("GenericERC20Mock",
                [cbBTCMockConstants.name, cbBTCMockConstants.symbol,
                cbBTCMockConstants.decimals, cbBTCMockConstants.totalSupply]);
    await cbBTCMock.waitForDeployment();

    expect(await cbBTCMock.totalSupply()).to.equal(
        cbBTCMockConstants.totalSupply * 10n ** cbBTCMockConstants.decimals);

    // deploy and test the cbBTC/USD mock aggregator
    const cbBTCMockAggregator = await hre.ethers.deployContract("MockV3Aggregator",
        [cbBTCAggregatorMockConstants.decimals,
        cbBTCAggregatorMockConstants.initialAnswer * 10n ** cbBTCMockConstants.decimals]);
    await cbBTCMockAggregator.waitForDeployment();
    expect(await cbBTCMockAggregator.decimals()).to.equal(cbBTCAggregatorMockConstants.decimals);


    /************** DEPLOY CORE CONTRACTS ******************/

    // deploy and test the Fund Controller
    const fundController = await hre.ethers.deployContract("FundController",
           [fundControllerConstants.initialEpochTime,
           fundControllerConstants.initialPercentageFeeProposers,
           fundControllerConstants.initialPercentageFeeGovernors,
           await usdcMock.getAddress(), await usdcMockAggregator.getAddress()]);

    await fundController.waitForDeployment();

    expect(await fundController.s_epochTime()).to.equal(
        fundControllerConstants.initialEpochTime);
    expect(await fundController.s_proposalPercentageReward()).to.equal(
        fundControllerConstants.initialPercentageFeeProposers);
    expect(await fundController.s_governorPercentageReward()).to.equal(
        fundControllerConstants.initialPercentageFeeGovernors);

    // deploy and test the Fund Token
    const fundToken = await hre.ethers.deployContract("FundToken",
        [await fundController.getAddress(), await usdcMock.getAddress(), await usdcMockAggregator.getAddress(),
        miscConstants.ZERO_ADDRESS]);   // ZERO_ADDRESS because this is for local unit tests
    await fundToken.waitForDeployment();

    /// check the base asset
    let assets = await fundToken.getAssets();
    expect(assets.length).to.equal(1);
    expect(assets[0].token).to.equal(await usdcMock.getAddress());
    expect(assets[0].aggregator).to.equal(await usdcMockAggregator.getAddress());

    // initialize the Fund Controller
    await fundController.initialize(await fundToken.getAddress());

    // return the contracts and the owner
    return { owner, fundToken, fundController, usdcMock, usdcMockAggregator,
             wethMock, wethMockAggregator, cbBTCMock, cbBTCMockAggregator };
    
}

/**
 * contractDeploymentForkedFixture
 * A fixture function that deploys the contracts 
 * on a forked blockchain network. This fixture
 * resets the network to a specific block number,
 * deploys the core contracts on the forked network,
 * and populates the wallets with tokens from the whales,
 * via signer impersonation.
 */
export async function contractDeploymentForkedFixture()
{
    await resetForkedNetwork();
    // this mine is required as a temporary fix
    // regarding chainId conflicts with hardhat
    await mine(1);
    const [owner, addr1, addr2] = await hre.ethers.getSigners();

    /************** DEPLOY CORE CONTRACTS ******************/

    // deploy and test the Fund Controller
    const fundController = await hre.ethers.deployContract("FundController",
           [fundControllerConstants.initialEpochTime,
           fundControllerConstants.initialPercentageFeeProposers,
           fundControllerConstants.initialPercentageFeeGovernors,
           baseMainnetConstants.usdcAddress, baseMainnetConstants.usdcAggregatorAddress]);

    await fundController.waitForDeployment();

    expect(await fundController.s_epochTime()).to.equal(
        fundControllerConstants.initialEpochTime);
    expect(await fundController.s_proposalPercentageReward()).to.equal(
        fundControllerConstants.initialPercentageFeeProposers);
    expect(await fundController.s_governorPercentageReward()).to.equal(
        fundControllerConstants.initialPercentageFeeGovernors);

    // deploy and test the Fund Token
    const fundToken = await hre.ethers.deployContract("FundToken",
        [await fundController.getAddress(), baseMainnetConstants.usdcAddress, baseMainnetConstants.usdcAggregatorAddress,
        baseMainnetConstants.uniswapRouterAddress]);
    await fundToken.waitForDeployment();

    /// check the base asset
    let assets = await fundToken.getAssets();
    expect(assets.length).to.equal(1);
    expect(assets[0].token).to.equal(baseMainnetConstants.usdcAddress);
    expect(assets[0].aggregator).to.equal(baseMainnetConstants.usdcAggregatorAddress);

    // initialize the Fund Controller
    await fundController.initialize(await fundToken.getAddress());

    /************** WHALE IMPERSONATION ******************/

    // impersonate the whales
    const cbBTCWhaleSigner = await hre.ethers.getImpersonatedSigner(baseMainnetConstants.cbBTCWhaleAddress);
    const wETHWhaleSigner = await hre.ethers.getImpersonatedSigner(baseMainnetConstants.wETHWhaleAddress);
    const usdcWhaleSigner = await hre.ethers.getImpersonatedSigner(baseMainnetConstants.usdcWhaleAddress);

    // get the ERC20 contracts
    const cbBTC: IERC20Extended = await hre.ethers.getContractAt("IERC20Extended", baseMainnetConstants.cbBTCAddress);
    const wETH: IERC20Extended = await hre.ethers.getContractAt("IERC20Extended", baseMainnetConstants.wETHAddress);
    const usdc: IERC20Extended = await hre.ethers.getContractAt("IERC20Extended", baseMainnetConstants.usdcAddress);

    // send some tokens to the owner, addr1, and addr2
    const AmountToSendAddresses_cbBTC = 2n;
    const AmountToSendAddresses_wETH = 5n;
    const AmountToSendAddresses_usdc = 10_000_000n;

    /// send the tokens to the owner
    await cbBTC.connect(cbBTCWhaleSigner).transfer(owner.address,
        AmountToSendAddresses_cbBTC * 10n ** await cbBTC.decimals());
    await wETH.connect(wETHWhaleSigner).transfer(owner.address,
        AmountToSendAddresses_wETH * 10n ** await wETH.decimals());
    await usdc.connect(usdcWhaleSigner).transfer(owner.address,
        AmountToSendAddresses_usdc * 10n ** await usdc.decimals());

    /// send the tokens to addr1
    await cbBTC.connect(cbBTCWhaleSigner).transfer(addr1.address,
        AmountToSendAddresses_cbBTC * 10n ** await cbBTC.decimals());
    await wETH.connect(wETHWhaleSigner).transfer(addr1.address,
        AmountToSendAddresses_wETH * 10n ** await wETH.decimals());
    await usdc.connect(usdcWhaleSigner).transfer(addr1.address,
        AmountToSendAddresses_usdc * 10n ** await usdc.decimals());

    /// send the tokens to addr2
    await cbBTC.connect(cbBTCWhaleSigner).transfer(addr2.address,
        AmountToSendAddresses_cbBTC * 10n ** await cbBTC.decimals());
    await wETH.connect(wETHWhaleSigner).transfer(addr2.address,
        AmountToSendAddresses_wETH * 10n ** await wETH.decimals());
    await usdc.connect(usdcWhaleSigner).transfer(addr2.address,
        AmountToSendAddresses_usdc * 10n ** await usdc.decimals());

    /// check that the balance of the owner is correct
    expect(await cbBTC.balanceOf(owner.address)).to.equal(
        AmountToSendAddresses_cbBTC * 10n ** await cbBTC.decimals());
    expect(await wETH.balanceOf(owner.address)).to.equal(
        AmountToSendAddresses_wETH * 10n ** await wETH.decimals());
    expect(await usdc.balanceOf(owner.address)).to.equal(
        AmountToSendAddresses_usdc * 10n ** await usdc.decimals());

    /// check that the balance of addr1 is correct
    expect(await cbBTC.balanceOf(addr1.address)).to.equal(
        AmountToSendAddresses_cbBTC * 10n ** await cbBTC.decimals());
    expect(await wETH.balanceOf(addr1.address)).to.equal(
        AmountToSendAddresses_wETH * 10n ** await wETH.decimals());
    expect(await usdc.balanceOf(addr1.address)).to.equal(
        AmountToSendAddresses_usdc * 10n ** await usdc.decimals());

    /// check that the balance of addr2 is correct
    expect(await cbBTC.balanceOf(addr2.address)).to.equal(
        AmountToSendAddresses_cbBTC * 10n ** await cbBTC.decimals());
    expect(await wETH.balanceOf(addr2.address)).to.equal(
        AmountToSendAddresses_wETH * 10n ** await wETH.decimals());
    expect(await usdc.balanceOf(addr2.address)).to.equal(
        AmountToSendAddresses_usdc * 10n ** await usdc.decimals());

    // return the core contracts, the ERC20 contracts,
    // the owner, and other testing addresses (addr1, addr2)
    return { owner, addr1, addr2, fundToken, fundController, cbBTC, wETH, usdc};
}

