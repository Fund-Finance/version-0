import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
require("dotenv").config();

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks:
  {
    hardhat:
    {
        // Should be changed when doing real testing
        // but for now assume gas prices are 0
        gasPrice: 0,
        initialBaseFeePerGas: 0,
        mining: {
         auto: true,     // automine so transacions process fast
         interval: 5000, // Regardless, Mine a block every 5 seconds
       },
    },
    // base_mainnet:
    // {
      // Should be changed when doing real testing
      // but for now assume gas prices are 0
    //   gasPrice: 0,
    //   initialBaseFeePerGas: 0,
    //   url: `${process.env.ALCHEMY_URL}/${process.env.ALCHEMY_API_KEY}`,
    //   accounts: [`${process.env.BASE_MAINNET_PRIVATE_KEY}`],
    // },
    localhost:
    {
        // Should be changed when doing real testing
        // but for now assume gas prices are 0
        gasPrice: 0,
        initialBaseFeePerGas: 0,
        mining: {
         auto: true,     // automine so transacions process fast
         interval: 5000, // Regardless, Mine a block every 5 seconds
       },
    },
  }
};

export default config;
