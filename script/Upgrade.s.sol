// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import "src/UnipoolInvestment.sol";

import {Upgrades} from "@openzeppelin-foundry-upgrades/Upgrades.sol";	
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

contract Upgrade is Script {
     function run() external {

        address proxyAddress = 0xc79AB5D4544E50Db86061cF34908Ea42ADc2EDda;
        vm.startBroadcast();
        //UnipoolInvestment unipoolNew = new UnipoolInvestment();
        //    address implAddrV1 = Upgrades.getImplementationAddress(proxy);
        Upgrades.upgradeProxy(proxyAddress, "UnipoolInvestment.sol:UnipoolInvestment", "");
        //ProxyAdmin.upgradeAndCall(proxyAddress, "UnipoolInvestment.sol:UnipoolInvestment", "")
        vm.stopBroadcast();
        //console.log("Proxy upgraded to:", address(unipoolNew));
    }
}