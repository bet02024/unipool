// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "forge-std/Test.sol";
import "../src/UnipoolInvestment.sol";

contract MockPermit2 is IPermit2 {
    function approve(address, address, uint160, uint48) external override {}
}

contract MockOracle is IOracle {
    mapping(address => uint256) public prices;

    function setPrice(address token, uint256 price) external {
        prices[token] = price;
    }

    function getPrice(address token) external view override returns (uint256) {
        return prices[token];
    }
}
 

