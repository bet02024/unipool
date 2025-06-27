// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {Upgrades} from "@openzeppelin-foundry-upgrades/Upgrades.sol";	
import "src/UnipoolInvestment.sol";

contract DeployScript is Script {
    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        //Unichain
        address stableCoin = address(0x078D782b760474a361dDA0AF3839290b0EF57AD6);  //usdc
        address router = address(0xEf740bf23aCaE26f6492B10de645D6B98dC8Eaf3);
        address oracle = address(0xC68e2a1c917b3E33B44aF4033BEb4bb327a0D209);    
        address treasury = address(0x922029678fEdA8625C463763ef8e4D3db0EeC5EE);  
        address permit2 = address(0x000000000022D473030F116dDEE9F6B43aC78BA3);   


        address proxy = Upgrades.deployUUPSProxy(
            "UnipoolInvestment.sol:UnipoolInvestment",
            abi.encodeCall(UnipoolInvestment.initialize, (stableCoin, router, oracle, treasury, permit2))
        );

        console.log("Unipool deployed at: %s", address(proxy));
        //UnipoolInvestment investment = new UnipoolInvestment();
        //investment.initialize(stableCoin, router, oracle, treasury, permit2);
        vm.stopBroadcast();
    }
}
