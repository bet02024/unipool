// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "../src/UnipoolOracle.sol";

contract DeployUniswapOracle is Script {
    function run() external {
        // Set these values according to your target network
        //address UNISWAP_V3_FACTORY = vm.envAddress("UNISWAP_V3_FACTORY");
        //uint8 CARDINALITY_PER_MINUTE = uint8(vm.envUint("CARDINALITY_PER_MINUTE"));
        //address USDC = vm.envAddress("USDC");
        vm.startBroadcast();
        UnipoolOracle oracle = new UnipoolOracle( );
        vm.stopBroadcast();
        console.log("UnipoolOracle deployed at: %s", address(oracle));
    }
} 