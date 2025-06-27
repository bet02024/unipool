// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {RouterParameters} from "@uniswap/universal-router/contracts/types/RouterParameters.sol";
import {UniversalRouter} from "@uniswap/universal-router/contracts/UniversalRouter.sol";
import { Upgrades } from "openzeppelin-foundry-upgrades/Upgrades.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Commands} from "../src/Commands.sol";
import {IUniversalRouter} from '../src/IUniversalRouter.sol';
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "forge-std/Test.sol";
import "../src/UnipoolInvestment.sol";
import "./Mocks.t.sol";
import "./IUnipoolInvestment.sol";
import {console} from "forge-std/console.sol";


contract InvestmentTest is Test {

    address constant UNIPOOL = 0xc79AB5D4544E50Db86061cF34908Ea42ADc2EDda;
    address constant USER = 0x209e808fb54D3EdbF6ffEC495d979EEb05f0fA9D;
    address constant ADMIN = 0xBC43808392a98f512db818723811c5D29ef3fD85;
    address constant USDC_ADDRESS = 0x078D782b760474a361dDA0AF3839290b0EF57AD6;
    address constant UNISWAP_ADDRESS = 0x8f187aA05619a017077f5308904739877ce9eA21;
    address constant WETH_ADDRESS = 0x4200000000000000000000000000000000000006;

    address router = address(0xEf740bf23aCaE26f6492B10de645D6B98dC8Eaf3);
    address oracle = address(0xC68e2a1c917b3E33B44aF4033BEb4bb327a0D209);    
    address permit2 = address(0x000000000022D473030F116dDEE9F6B43aC78BA3);   
 

    string constant MAINNET_RPC_URL = "https://unichain-mainnet.g.alchemy.com/v2/Yam_DTMvfOVBprWVttM9C";

    IUnipoolInvestment unipoolContract;
    IERC20 stableCoin;

     PoolKey ETH_USDC_KEY = PoolKey({
        currency0: Currency.wrap(USDC_ADDRESS),
        currency1: Currency.wrap(WETH_ADDRESS),
        fee: 3000,
        tickSpacing: 60,
        hooks: IHooks(address(0))
    });

    bytes constant actions = abi.encodePacked(
        uint8(Actions.SWAP_EXACT_IN_SINGLE),
        uint8(Actions.SETTLE_ALL),
        uint8(Actions.TAKE_ALL)
    );

    IPermit2 PERMIT2 = IPermit2(permit2);
    IUniversalRouter UNIVERSAL_ROUTER = IUniversalRouter(router);
    IERC20 USDC = IERC20(USDC_ADDRESS);
    IERC20 WETH = IERC20(WETH_ADDRESS);

    function setUp() public {
        unipoolContract = IUnipoolInvestment(UNIPOOL);
        stableCoin = IERC20(USDC);
        vm.startPrank(USER);
        stableCoin.approve(address(UNIPOOL), type(uint256).max);
        //deal(USDC_ADDRESS, USER, 1e12);  
        //deal(WETH_ADDRESS, USER, 1e20);  
        vm.label(router, "UNIVERSAL_ROUTER");
        vm.label(permit2, "PERMIT2");
        vm.label(USDC_ADDRESS, "USDC");
        vm.label(UNISWAP_ADDRESS, "UNI");
        vm.label(WETH_ADDRESS, "WETH");
        vm.stopPrank();
        console.log("UNI BALANCE", IERC20(UNISWAP_ADDRESS).balanceOf(UNIPOOL)); 
        console.log("WETH BALANCE", IERC20(WETH_ADDRESS).balanceOf(UNIPOOL)); 
    }

    function testInvest() public {
        vm.startPrank(USER);
        uint256 userBalace = unipoolContract.userShares(USER);
        console.log("shares", userBalace);
        unipoolContract.invest(1e6);
        console.log("shares", unipoolContract.userShares(USER)); 
        vm.stopPrank();
    }

    function testWithdraw() public {
        vm.startPrank(USER);
        unipoolContract.withdraw(5000);
        vm.stopPrank();
    } 


    function testRebalance() public {
        vm.startPrank(ADMIN);
        //112560545240778613
        address[] memory sellAssets =  new address[](1);
        sellAssets[0] = UNISWAP_ADDRESS;
        uint256[] memory sellAmounts =  new uint256[](1);
        sellAmounts[0] = 52560545240778613;
        address[] memory buyAssets =  new address[](1);
        buyAssets[0] = WETH_ADDRESS;
        uint256[] memory buyAmounts =  new uint256[](1);
        buyAmounts[0] = 10000;
        unipoolContract.rebalance(sellAssets, sellAmounts, buyAssets, buyAmounts);
        vm.stopPrank();
    } 

 

    function testSwapWETHForUSD() public {
        uint128 amountIn = 1e18;
        uint128 minAmountOut = 0;
        deal(WETH_ADDRESS, address(this), amountIn);

        WETH.approve(permit2, amountIn);
        PERMIT2.approve(WETH_ADDRESS, router, amountIn, uint48(block.timestamp) + 1 hours);
        bytes memory commands = abi.encodePacked(uint8(Commands.V4_SWAP));
        bytes[] memory inputs = new bytes[](1);
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: ETH_USDC_KEY,
                zeroForOne: false,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                hookData: bytes("")
            })
        );
        params[1] = abi.encode(ETH_USDC_KEY.currency1, amountIn);
        params[2] = abi.encode(ETH_USDC_KEY.currency0, minAmountOut);

        inputs[0] = abi.encode(actions, params);

        UNIVERSAL_ROUTER.execute(commands, inputs, block.timestamp +20);

        //assertGt(USDC.balanceOf(address(this)), minAmountOut);
    }

    function testSwapUSDCForWETH() public {
        uint128 amountIn = 1e12;
        uint128 minAmountOut = 0;
        deal(USDC_ADDRESS, address(this), 1e12);  
        USDC.approve(permit2, amountIn);
        PERMIT2.approve(USDC_ADDRESS, router, amountIn, uint48(block.timestamp) + 1 hours);

        bytes memory commands = abi.encodePacked(uint8(Commands.V4_SWAP));
        bytes[] memory inputs = new bytes[](1);
        bytes[] memory params = new bytes[](3);

        params[0] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: ETH_USDC_KEY,
                zeroForOne: true,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                hookData: bytes("")
            })
        );
        params[1] = abi.encode(ETH_USDC_KEY.currency0, amountIn);
        params[2] = abi.encode(ETH_USDC_KEY.currency1, minAmountOut);

        inputs[0] = abi.encode(actions, params);

        UNIVERSAL_ROUTER.execute(commands, inputs, block.timestamp + 20);

        //assertGt(address(this).balance, minAmountOut);
    }


} 
 
