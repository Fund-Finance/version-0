// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract GenericERC20Mock is ERC20
{
    uint8 internal s_decimals;
    constructor(string memory _name, string memory _symbol,
               uint8 _decimals, uint256 initialSupply)
        ERC20(_name, _symbol)
    {
        s_decimals = _decimals;
        _mint(address(this), initialSupply * 10 ** decimals());
    }

    function decimals() public view virtual override returns (uint8)
    {
        return s_decimals;
    }
}
