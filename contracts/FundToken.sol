// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FundToken is ERC20, Ownable
{
    address[] public s_assets;
    address public s_controllerAddress;

    // NOTE: Here the owner of the token is the controller
    constructor(address _controllerAddress)
        ERC20("FundToken", "FUND") Ownable(_controllerAddress)
    {}

    function mint(address _to, uint256 _amount) external onlyOwner
    {
        _mint(_to, _amount);
    }

    function burn(address _from, uint256 _amount) external onlyOwner
    {
        _burn(_from, _amount);
    }



}
