// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PortfolioInvestment.sol";

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

contract MockUniswapRouter is IUniswapV4Router {
    function swapExactTokensForTokens(
        uint amountIn,
        uint,
        address[] calldata path,
        address to,
        uint
    ) external override returns (uint[] memory amounts) {
        require(path.length == 2, "Invalid path");
        address fromToken = path[0];
        address toToken = path[1];

        IERC20Upgradeable(fromToken).transferFrom(msg.sender, address(this), amountIn);
        uint256 outAmount = amountIn; // 1:1 mock rate
        IERC20Upgradeable(toToken).transfer(to, outAmount);

        amounts = new uint[](2);
        amounts[0] = amountIn;
        amounts[1] = outAmount;
    }
}