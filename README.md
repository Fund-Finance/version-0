# version-0

## To Install:
1) Clone this repository and cd into it
2) Run `npm install` to install all of the project dependencies
3) Then run `npx hardhat compile` to compile the smart contracts
4) Then run `npx hardhat test` to run the test cases

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