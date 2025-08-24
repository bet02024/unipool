// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IUnipoolInvestment { 

        function assetBalances() external view returns (address[] memory, uint256[] memory);

        function invest(uint256 amount) external;

        function userShares(address user) external view returns (uint256);

        function withdraw(uint256 basisPoints) external;

        function getUserShareValue(address user) external view returns (uint256);

        function getPortfolioValue() external view returns (uint256);

        function rebalance(address[] calldata sellAssets, uint256[] calldata sellAmountsBps, address[] calldata buyAssets, uint256[] calldata buyAmountsBps) external;

}
