// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "../src/UniswapOracle.sol";



//forge script script/DeployUniswapOracle.s.sol --rpc-url <RPC_URL> --private-key <YOUR_PRIVATE_KEY> --broadcast

contract DeployUniswapOracle is Script {
    function run() external {
        // Set these values according to your target network
        address UNISWAP_V3_FACTORY = vm.envAddress("UNISWAP_V3_FACTORY");
        uint8 CARDINALITY_PER_MINUTE = uint8(vm.envUint("CARDINALITY_PER_MINUTE"));
        address USDC = vm.envAddress("USDC");

        vm.startBroadcast();

        UniswapOracle oracle = new UniswapOracle(
            IUniswapV3Factory(UNISWAP_V3_FACTORY),
            CARDINALITY_PER_MINUTE,
            USDC
        );

        vm.stopBroadcast();

        console2.log("UniswapOracle deployed at: %s", address(oracle));
    }
}