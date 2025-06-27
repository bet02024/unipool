 
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IUniversalRouter} from "./IUniversalRouter.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Commands} from "./Commands.sol";
import {IV4Router} from  "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {console} from "forge-std/console.sol";

interface IOracle {
    function getPrice(address token) external view returns (uint256);
}
interface IPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

contract UnipoolInvestmentOld is Initializable, UUPSUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {

    bytes32 public constant PORTFOLIO_MANAGER_ROLE = keccak256("PORTFOLIO_MANAGER_ROLE");
    using SafeERC20 for IERC20;

    IERC20 public stableCoin;
    IUniversalRouter public universalRouter;
    IOracle public priceOracle;
    IPermit2 public permit2;
    address public treasury;
    uint256 private precision = 10000000000;

    uint256 public totalShares;
    mapping(address => uint256) public userShares;
    mapping(address => uint256) public userInvestedAmount;
    address[] private portfolioAssets;

    // Returns the list of current portfolio assets
    function portfolioAssetsList() public view returns (address[] memory) {
        return portfolioAssets;
    }

    // Returns two arrays: the portfolio asset addresses and their values via _getAssetValue
    function assetBalances() external view returns (address[] memory, uint256[] memory) {
        uint256 n = portfolioAssets.length;
        uint256[] memory balances = new uint256[](n);
        address[] memory assets = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            assets[i] = portfolioAssets[i];
            balances[i] = _getAssetValue(portfolioAssets[i]);
        }
        return (assets, balances);
    }

    event Invest(address indexed investor, uint256 amount);
    event Withdraw(address indexed investor, uint256 amount, uint256 sentToUser, uint256 sentToTreasury);
    event Rebalanced(address[] sellAssets, address[] buyAssets);
    event AssetSwapped(address indexed fromToken, address indexed toToken, uint256 amountIn, uint256 amountOut);

    function initialize(address _stableCoin, address _universalRouter, address _oracle, address _treasury, address _permit2) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PORTFOLIO_MANAGER_ROLE, msg.sender);

        stableCoin = IERC20(_stableCoin);
        universalRouter = IUniversalRouter(_universalRouter);
        priceOracle = IOracle(_oracle);
        permit2 = IPermit2(_permit2);
        treasury = _treasury;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}


    function approveTokenWithPermit2(
        address token,
        uint160 amount,
        uint48 expiration
    ) internal {
        IERC20(token).approve(address(permit2), type(uint256).max);
        permit2.approve(token, address(universalRouter), amount, expiration);
    }

    function swapTokens(
        uint256 amountToInvest,
        address token0,
        address token1

    ) internal returns (uint256 amountOut)  {
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });
        return _swapExactInputSingle(key, uint128(amountToInvest), 0);
    }


    function _swapExactInputSingle(PoolKey memory key, uint128 amountIn, uint128 minAmountOut) internal returns (uint256 amountOut) {
       
        approveTokenWithPermit2( Currency.unwrap(key.currency0), amountIn, uint48(block.timestamp + 1 hours));
       
        bytes memory commands = abi.encodePacked(uint8(Commands.V4_SWAP));

        bytes memory actions = abi.encodePacked(
            uint8(Actions.SWAP_EXACT_IN_SINGLE),
            uint8(Actions.SETTLE_ALL),
            uint8(Actions.TAKE_ALL)
        );

        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: key,
                zeroForOne: true,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                hookData: bytes("")
            })
        );
        params[1] = abi.encode(key.currency0, amountIn);
        params[2] = abi.encode(key.currency1, minAmountOut);

        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);

        universalRouter.execute(commands, inputs, block.timestamp + 20);

        amountOut = IERC20( Currency.unwrap(key.currency1)).balanceOf(address(this));
        require(amountOut >= minAmountOut, "Insufficient output amount");
        
    }

    function invest(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        require(portfolioAssets.length > 0, "Porfolio assets not set yet");

        stableCoin.safeTransferFrom(msg.sender, address(this), amount);
        uint256 totalPortfolioValue = getPortfolioValue();

        uint256 sharesToMint = totalShares == 0 ? amount : (amount * totalShares) / totalPortfolioValue;
        userShares[msg.sender] += sharesToMint;
        userInvestedAmount[msg.sender] += amount;
        totalShares += sharesToMint;


        for (uint256 i = 0; i < portfolioAssets.length; i++) {
            address asset = portfolioAssets[i];

            uint256 totalAssetValue = _getAssetValue(asset);
            uint256 assetPercentageToBuy = (totalAssetValue * 1e18) / totalPortfolioValue;

            uint256 amountToInvest = (amount * assetPercentageToBuy) / 1e18;
            if (amountToInvest > 0) {
                swapTokens( amountToInvest, address(stableCoin), asset);
            }
        }

        emit Invest(msg.sender, amount);
    }


    function withdraw(uint256 basisPoints) external nonReentrant whenNotPaused {
        require(basisPoints > 0 && basisPoints <= 10000, "Invalid percentage");
        uint256 userShare = userShares[msg.sender];
        require(userShare > 0, "No shares to withdraw");

        uint256 withdrawShares = (userShare * basisPoints) / 10000;
        require(withdrawShares > 0, "Insufficient share");
        console.log("withdraw");
        
        uint256 investedProportionToSell = (userInvestedAmount[msg.sender] * withdrawShares) / userShare;

        //uint256 portfolioValue = getPortfolioValue();
        //uint256 amountStable = (withdrawShares * portfolioValue) / totalShares;
        uint256 totalSharesPortfolioToWithdraw = (withdrawShares * precision) / totalShares;
        userShares[msg.sender] -= withdrawShares;
        totalShares -= withdrawShares;
        uint256 totalconverted = 0;
        console.log("withdrawShares", withdrawShares);

        for (uint256 i = 0; i < portfolioAssets.length; i++) {
            address asset = portfolioAssets[i];
            uint256 assetBalance = IERC20(asset).balanceOf(address(this));
            uint256 amountToSell = (assetBalance * totalSharesPortfolioToWithdraw) / precision;
            if (amountToSell > 0) {
                console.log("pre swap", asset);
                totalconverted += swapTokens( amountToSell, asset, address(stableCoin));
            }
            console.log("post swap", asset);

        }

        uint256 gain = totalconverted > investedProportionToSell ? totalconverted - investedProportionToSell : 0;
        uint256 fee = (gain * 8) / 100;
        uint256 amountToUser = totalconverted - fee;

        stableCoin.safeTransfer(msg.sender, amountToUser);
        if (fee > 0) {
            stableCoin.safeTransfer(treasury, fee);
        }

        userInvestedAmount[msg.sender] -= investedProportionToSell;
        emit Withdraw(msg.sender, totalconverted, amountToUser, fee);
    } 

    function _getAssetValue(address asset) internal view returns (uint256) {
        uint256 balance = IERC20(asset).balanceOf(address(this));
        uint256 price = priceOracle.getPrice(asset);
        return (balance * price) / 1e18;
    }

    function getUserShareValue(address user) public view returns (uint256) {
        return (userShares[user] * getPortfolioValue()) / totalShares;
    }

    function getPortfolioValue() public view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < portfolioAssets.length; i++) {
            address asset = portfolioAssets[i];
            total += _getAssetValue(asset);
        }
        return total;
    }

    //Intial Settup
    function setPortfolioAssets(address[] calldata assets) external onlyRole(PORTFOLIO_MANAGER_ROLE) {
        require(portfolioAssets.length == 0, "Porfolio assets already set");
        portfolioAssets = assets;
    }

    function rebalance(address[] calldata sellAssets, uint256[] calldata sellAmounts, address[] calldata buyAssets, uint256[] calldata buyAmounts) external onlyRole(PORTFOLIO_MANAGER_ROLE) whenNotPaused {
        require(sellAssets.length == sellAmounts.length && buyAssets.length == buyAmounts.length, "Array length mismatch");

        for (uint256 i = 0; i < sellAssets.length; i++) {
            swapTokens( sellAmounts[i], sellAssets[i], address(stableCoin));
        }

        uint256 stableBalance = stableCoin.balanceOf(address(this));
        for (uint256 i = 0; i < buyAssets.length; i++) {
            uint256 amount = buyAmounts[i];
            if (amount > stableBalance) {
                amount = stableBalance;
            }
            if (amount == 0) continue;
            swapTokens( uint128(amount), address(stableCoin), buyAssets[i]);
            stableBalance -= amount;
        }

        // Remove all assets with a balance of 0 from portfolioAssets
        uint256 removalIndex = 0;
        while (removalIndex < portfolioAssets.length) {
            if (IERC20(portfolioAssets[removalIndex]).balanceOf(address(this)) == 0) {
                // Remove asset by swapping with last and popping
                portfolioAssets[removalIndex] = portfolioAssets[portfolioAssets.length - 1];
                portfolioAssets.pop();
            } else {
                removalIndex++;
            }
        }

        // Add new assets from buyAssets if not already included
        for (uint256 addIdx = 0; addIdx < buyAssets.length; addIdx++) {
            address newAsset = buyAssets[addIdx];
            bool exists = false;
            for (uint256 checkIdx = 0; checkIdx < portfolioAssets.length; checkIdx++) {
                if (portfolioAssets[checkIdx] == newAsset) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                portfolioAssets.push(newAsset);
            }
        }

        emit Rebalanced(sellAssets, buyAssets);
    }

    function setOracle(address _oracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        priceOracle = IOracle(_oracle);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
