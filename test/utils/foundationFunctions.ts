/**
 * foundationFunctions.ts
 * This is a utilities file that contains foundational functions
 * which are used in the main unit tests. These functions consist of
 * operations that the test cases treat as atomic. In each of these
 * functions, the operation is run and tests are also run to ensure
 * that the operation was successful.
 */

import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { GenericERC20Mock, FundToken, FundController, IERC20Extended, FundMockAggregator } from "../../typechain-types/";
import { AggregatorV3Interface } from "../../typechain-types/@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface";
import { fundControllerConstants } from "./constants";


/**
 * mintFromStableCoin
 * This function mints fund tokens from the USDC
 * stable coin and tests each step in the process
 * @param usdc: The stable coin contract, could be mock or real
 * @param usdcAggregator: The stable coin aggregator contract, could be mock or real
 * @param owner: The owner minting the fund Token
 * @param fundToken: The fund token contract
 * @param fundController: The fund controller contract
 * @param AmountToSpend: The amount of stable coin the owner is spending
 */
export async function mintFromStableCoin(usdc: GenericERC20Mock | IERC20Extended,
                                  usdcAggregator: FundMockAggregator | AggregatorV3Interface,
                                  owner: SignerWithAddress,
                                  fundToken: FundToken,
                                  fundController: FundController,
                                  AmountToSpend: bigint)
{
    // now in order to mint we need to approve the fund Controller to spend
    // on our behalf
    await usdc.connect(owner).approve(await fundController.getAddress(),
        AmountToSpend * 10n ** await usdc.decimals());

    // check that the allowance updated correctly
    expect(await usdc.allowance(owner.address, await fundController.getAddress())).to.equal(
        AmountToSpend * 10n ** await usdc.decimals());

    // store the before state of the fund,
    // these values will be used later in testing
    const fTokenTotalSupplyBeforeMint = await fundToken.totalSupply();
    const ownerfTokenBalanceBeforeMint = await fundToken.balanceOf(owner.address);
    const fundUSDCBalanceBeforeMint = await usdc.balanceOf(fundToken.getAddress());
    
    let amountToMint = 0n;
    // if the fund token has no supply, we need to mint the initial amount
    // This is a special case because the fund token is not yet in circulation
    // In this case we mint based on the initial minting unit conversion
    if (await fundToken.totalSupply() == 0n)
    {
        const usdcAggregatorData = await usdcAggregator.latestRoundData()
        const dollarToUSD = usdcAggregatorData[1];
        const unitConversion = 10n ** (await fundToken.decimals() - await usdc.decimals()) /
            fundControllerConstants.initialMintingUnitConversion;
        amountToMint = (AmountToSpend * (10n ** await usdc.decimals()) * dollarToUSD * unitConversion) /
            (10n ** await usdcAggregator.decimals());
    }
    // otherwise we mint based on the total value of the fund in $
    else
    {
        const usdcAggregatorData = await usdcAggregator.latestRoundData()
        const dollarToUSD = usdcAggregatorData[1];
        amountToMint = (AmountToSpend * 10n ** await usdc.decimals() *
        dollarToUSD * fTokenTotalSupplyBeforeMint) /
        (await fundToken.getTotalValueOfFund() *
        10n ** await usdcAggregator.decimals())
    }

    // call the operation to mint
    await fundController.connect(owner).issueUsingStableCoin(AmountToSpend * 10n ** await usdc.decimals());

    expect(await fundToken.totalSupply()).to.equal(fTokenTotalSupplyBeforeMint + amountToMint);

    // check the fund token balance of the minter
    expect(await fundToken.balanceOf(owner.address)).to.equal(ownerfTokenBalanceBeforeMint + amountToMint);


    // check that the fund token has received usdc 
    expect(await usdc.balanceOf(fundToken.getAddress())).to.equal(fundUSDCBalanceBeforeMint + 
        AmountToSpend * 10n ** await usdc.decimals());
}

/** addAssetToFund
 * This function adds an asset to the fund and tests each step in the process
 * An asset is an ERC20 token that the fund will trade
 * @param fundController: The fund controller contract
 * @param fundToken: The fund token contract
 * @param assetAddress: The address of the asset to add
 * @param assetAggregatorAddress: The address of the asset aggregator
 */
export async function addAssetToFund(fundController: FundController,
                            fundToken: FundToken,
                            assetAddress: string,
                            assetAggregatorAddress: string)
{
    // get the fund token assets before adding
    const assetsBefore = await fundToken.getAssets();

    // add the new asset to the fund
    await fundController.addAssetToFund(assetAddress, assetAggregatorAddress);

    // check if the fund token has the asset
    const assetsAfter = await fundToken.getAssets();
    const newIndex = assetsBefore.length;

    expect(assetsAfter.length).to.equal(assetsBefore.length + 1);
    expect(assetsAfter[newIndex].token).to.equal(assetAddress);
    expect(assetsAfter[newIndex].aggregator).to.equal(assetAggregatorAddress);

    // check that the asset addition did not change the other assets
    for (let i = 0; i < assetsAfter.length - 1; i++)
    {
        expect(assetsAfter[i].token).to.equal(assetsBefore[i].token);
        expect(assetsAfter[i].aggregator).to.equal(assetsBefore[i].aggregator);
    }
}

/** createProposal
 * creates a proposal of which assets in the fund to trade
 * and tests each step in the process
 * @param fundController: The fund controller contract
 * @param assetToTrade: The asset to trade
 * @param assetToReceive: The asset to receive
 * @param amountIn: The amount to trade
 * @param proposer: The proposer of the trade
 */
export async function createProposal(fundController: FundController,
                                assetToTrade: string,
                                assetToReceive: string,
                                amountIn: bigint,
                                proposer: SignerWithAddress)
{
    // get the proposals before creating the new one
    const proposalsBefore = await fundController.getActiveProposals();
    // create the proposal
    await fundController.connect(proposer).createProposal(assetToTrade, assetToReceive, amountIn);
    const proposalsAfter = await fundController.getActiveProposals();
    const newIndex = proposalsBefore.length;

    // check that the new proposal was created
    expect(proposalsAfter.length).to.equal(proposalsBefore.length + 1);
    expect(proposalsAfter[newIndex].id).to.equal(newIndex + 1);
    expect(proposalsAfter[newIndex].proposer).to.equal(await proposer.getAddress());
    expect(proposalsAfter[newIndex].assetToTrade).to.equal(assetToTrade);
    expect(proposalsAfter[newIndex].assetToReceive).to.equal(assetToReceive);
    expect(proposalsAfter[newIndex].amountIn).to.equal(amountIn);

    // check that the proposal creation did not change the other proposals
    for (let i = 0; i < proposalsAfter.length - 1; i++)
    {
        expect(proposalsAfter[i].id).to.equal(proposalsBefore[i].id);
        expect(proposalsAfter[i].proposer).to.equal(proposalsBefore[i].proposer);
        expect(proposalsAfter[i].assetToTrade).to.equal(proposalsBefore[i].assetToTrade);
        expect(proposalsAfter[i].assetToReceive).to.equal(proposalsBefore[i].assetToReceive);
        expect(proposalsAfter[i].amountIn).to.equal(proposalsBefore[i].amountIn);
    }
}

/** acceptProposal
 * This function accepts a proposal and tests each step in the process
 * @param proposalId: The id of the proposal to accept
 * @param fundController: The fund controller contract
 * @param fundToken: The fund token contract
 * @param owner: The owner/governor accepting the proposal
 * @param assetToTrade: The asset to trade
 * @param assetToReceive: The asset to receive
 */
export async function acceptProposal(proposalId: bigint,
                             fundController: FundController,
                             fundToken: FundToken,
                             owner: SignerWithAddress,
                             assetToTrade: IERC20Extended,
                             assetToReceive: IERC20Extended)
{
    // get the current number of active proposals
    const activeProposals = await fundController.getActiveProposals();

    // check if the proposal exists
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

    // get the asset balances before the swap
    const amountOfBaseAssetBeforeSwap = await assetToTrade.balanceOf(await fundToken.getAddress());
    const amountOfQuoteAssetBeforeSwap = await assetToReceive.balanceOf(await fundController.getAddress());

    // accept the proposal
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

    // check that the proposal was removed from the active proposals
    const activeProposalsAfter = await fundController.getActiveProposals();
    for (let i = 0; i < activeProposalsAfter.length; i++)
    {
        expect(activeProposalsAfter[i].id).to.not.equal(proposalId);
    }

    // TODO: check that the other active proposals are still there
}

