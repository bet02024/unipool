// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "src/PortfolioInvestment.sol";

contract DeployScript is Script {
    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        address stableCoin = address(0x...); // Replace
        address router = address(0x...);     // Replace
        address oracle = address(0x...);     // Replace
        address treasury = address(0x...);   // Replace
        address permit2 = address(0x...);    // Replace

        PortfolioInvestment investment = new PortfolioInvestment();
        investment.initialize(stableCoin, router, oracle, treasury, permit2);

        vm.stopBroadcast();
    }
}
