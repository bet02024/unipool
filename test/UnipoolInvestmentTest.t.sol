// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {RouterParameters} from "@uniswap/universal-router/contracts/types/RouterParameters.sol";
import {UniversalRouter} from "@uniswap/universal-router/contracts/UniversalRouter.sol";
import { Upgrades } from "openzeppelin-foundry-upgrades/Upgrades.sol";

import "forge-std/Test.sol";
import "../src/UnipoolInvestment.sol";
import "./Mocks.t.sol";

contract UnipoolInvestmentTest is Test {
    UnipoolInvestment public portfolio;
    UnipoolInvestment public upgradedPortfolio;
    MockPermit2 public permit2;
    MockOracle public oracle;
    UniversalRouter router;

    ERC20Mock public stable;
    ERC20Mock public tokenA;
    ERC20Mock public tokenB;

    address public user = address(1);
    address public treasury = address(2);
    address public admin = address(this);

    function setUp() public {
        stable = new ERC20Mock(user, 1000000e18);
        tokenA = new ERC20Mock(address(this), 1000000e18);
        tokenB = new ERC20Mock(address(this), 1000000e18);

        permit2 = new MockPermit2();
        oracle = new MockOracle();

        RouterParameters memory params = RouterParameters({
            permit2: address(0),
            weth9: address(0),
            v2Factory: address(0),
            v3Factory: address(0),
            pairInitCodeHash: bytes32(0),
            poolInitCodeHash: bytes32(0),
            v4PoolManager: address(0),
            v3NFTPositionManager: address(0),
            v4PositionManager: address(0)
        });
        router = new UniversalRouter(params);


        portfolio = new UnipoolInvestment();
        portfolio.initialize(address(stable), address(router), address(oracle), treasury, address(permit2));

        address[] memory assets = new address[](2);
        assets[0] = address(tokenA);
        assets[1] = address(tokenB);
        portfolio.setPortfolioAssets(assets);

        oracle.setPrice(address(tokenA), 2e18);
        oracle.setPrice(address(tokenB), 5e18);

        vm.startPrank(user);
        stable.approve(address(portfolio), type(uint256).max);
        vm.stopPrank();
    }

    function testInvestAndWithdrawEdgeCase() public {
        vm.startPrank(user);

        portfolio.invest(100e18);
        assertEq(portfolio.userShares(user), 100e18);

        oracle.setPrice(address(tokenA), 4e18);
        oracle.setPrice(address(tokenB), 10e18);

        uint256 expectedValue = portfolio.getUserShareValue(user);
        assertGt(expectedValue, 100e18);

        portfolio.withdraw(10000);

        uint256 userFinalBalance = stable.balanceOf(user);
        uint256 treasuryBalance = stable.balanceOf(treasury);

        assertGt(userFinalBalance, 95e18);
        assertGt(treasuryBalance, 4e18);

        vm.stopPrank();
    }

    function testRebalanceWithInsufficientStable() public {
        vm.startPrank(user);
        portfolio.invest(100e18);
        vm.stopPrank();

        address[] memory sellAssets = new address[](1);
        uint256[] memory sellAmounts = new uint256[](1);
        address[] memory buyAssets = new address[](1);
        uint256[] memory buyAmounts = new uint256[](1);

        sellAssets[0] = address(tokenA);
        sellAmounts[0] = 10e18;
        buyAssets[0] = address(tokenB);
        buyAmounts[0] = 200e18; // Intentional overspend

        portfolio.rebalance(sellAssets, sellAmounts, buyAssets, buyAmounts);
    }

    function testWithdrawWithoutInvestmentReverts() public {
        vm.startPrank(user);
        vm.expectRevert("No shares to withdraw");
        portfolio.withdraw(10000);
        vm.stopPrank();
    }

    function testWithdrawInvalidPercentageReverts() public {
        vm.startPrank(user);
        portfolio.invest(100e18);
        vm.expectRevert("Invalid percentage");
        portfolio.withdraw(0);

        vm.expectRevert("Invalid percentage");
        portfolio.withdraw(10001);
        vm.stopPrank();
    }

    function testWithdrawMoreThanOwnedSharesReverts() public {
        vm.startPrank(user);
        portfolio.invest(100e18);
        vm.expectRevert();
        portfolio.withdraw(15000);
        vm.stopPrank();
    }

    function testPauseAndUnpause() public {
        vm.prank(admin);
        portfolio.pause();

        vm.startPrank(user);
        vm.expectRevert("Pausable: paused");
        portfolio.invest(100e18);
        vm.stopPrank();

        vm.prank(admin);
        portfolio.unpause();

        vm.startPrank(user);
        portfolio.invest(100e18);
        assertEq(portfolio.userShares(user), 100e18);
        vm.stopPrank();
    }

   /* function testUUPSUpgradeAuthorization() public {
        address attacker = address(99);
        vm.prank(attacker);
        vm.expectRevert("AccessControl: account .* is missing role DEFAULT_ADMIN_ROLE");
        portfolio.upgradeTo(address(0x1234));
    }*/

    /*
    function testUUPSUpgradeSimulation() public {
        upgradedPortfolio = new UnipoolInvestment();

        vm.prank(admin);
        portfolio.upgradeTo(address(upgradedPortfolio));

        vm.startPrank(user);
        portfolio.invest(50e18);
        assertEq(portfolio.userShares(user), 50e18);
        vm.stopPrank();
    }
    */

}

contract ERC20Mock is ERC20Upgradeable {
    constructor(address initialAccount, uint256 initialBalance) {
        _mint(initialAccount, initialBalance);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
