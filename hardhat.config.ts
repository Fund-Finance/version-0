import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
require("dotenv").config();

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks:
  {
    hardhat: {},
    base_mainnet:
    {
      url: `${process.env.ALCHEMY_URL}/${process.env.ALCHEMY_API_KEY}`,
      accounts: [`${process.env.BASE_MAINNET_PRIVATE_KEY}`],
    }
  }
};

export default config;
