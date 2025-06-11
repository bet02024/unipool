// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";

import "src/PortfolioInvestment.sol";

contract DeployScript is Script {
    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        //Unichain
        address stableCoin = address(0x078D782b760474a361dDA0AF3839290b0EF57AD6);  //usdc
        address router = address(0xEf740bf23aCaE26f6492B10de645D6B98dC8Eaf3);
        address oracle = address(0x0000000000000000000000000000000000000000);     // Replace
        address treasury = address(0x0000000000000000000000000000000000000000);   // Replace
        address permit2 = address(0x000000000022D473030F116dDEE9F6B43aC78BA3);   

        PortfolioInvestment investment = new PortfolioInvestment();
        investment.initialize(stableCoin, router, oracle, treasury, permit2);

        vm.stopBroadcast();
    }
}
