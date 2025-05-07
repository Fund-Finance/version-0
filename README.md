# version-0

## To Install:
1) Clone this repository and cd into it
2) Run `npm install` to install all of the project dependencies
3) Then run `npx hardhat compile` to compile the smart contracts

## To Test:
- Note that there are two types of tests:
    1) Unit tests: Meant for testing basic functionality of the smart contracts
    2) Integration tests: Meant for testing the interaction between multiple smart contracts on the blockchain (used for uniswap trading for example)
- Unit tests run on the local hardhat network
- Integration tests run on a forked base mainnet

### For unit tests:
1) Run `npx hardhat test`

### For integration tests:
**NOTE:** You need to have an alchemy account in order to fork the base mainnet and run the integration tests
1) Create an [alchemy account](alchemy.com) to get your URL and API key for the base mainnet. **Do not share this information with anyone else**
2) populate the data in the `.env_incomplete` file
3) Rename the `.env_incomplete` file to `.env`
4) run `source .env`
5) Run `npx hardhat node --fork "${ALCHEMY_URL}${ALCHEMY_API_KEY}" --fork-block-number ${BASE_MAINNET_BLOCK_TO_FORK}`
6) Then open a new terminal and run `npx hardhat test --network localhost` to run the integration tests

## Releases:

### v0.1:
- Mainly developed `FundController.sol` and `FundToken.sol`
- The Fund Controller has proper getter and setter methods
- Basic minting functionality through a stable coin
- Chainlink Aggregator added to get the price of an asset
- Corrisponding Mock contracts added to assist with testing
- Proper unit tests were written to test the following functionality off-chain:
    - Initialization procedure of each contract
    - Functionality of the Mock contracts
    - The basic getter and setter fields of the Mock contract

### v0.2:
- Added missing test case for minting FundToken using USDC
- Added network configuration settings and documentation needed to run the integration tests
- Added basic logic to distinguish between unit and integration tests in the `Fund.ts` test file
- Added functionality to perform a basic swap on Uniswap for the underlying assets in the FundToken
    - Added a basic test case to test the swap functionality
