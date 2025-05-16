 
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IUniswapV4Router {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

interface IOracle {
    function getPrice(address token) external view returns (uint256);
}

interface IPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

contract PortfolioInvestment is Initializable, UUPSUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 public constant PORTFOLIO_MANAGER_ROLE = keccak256("PORTFOLIO_MANAGER_ROLE");

    IERC20Upgradeable public stableCoin;
    IUniswapV4Router public uniswapRouter;
    IOracle public priceOracle;
    IPermit2 public permit2;
    address public treasury;

    uint256 public totalShares;
    mapping(address => uint256) public userShares;
    mapping(address => uint256) public userInvestedAmount;
    mapping(address => uint256) public assetBalances;
    address[] public portfolioAssets;

    event Invest(address indexed investor, uint256 amount);
    event Withdraw(address indexed investor, uint256 amount, uint256 sentToUser, uint256 sentToTreasury);
    event Rebalanced(address[] sellAssets, address[] buyAssets);
    event AssetSwapped(address indexed fromToken, address indexed toToken, uint256 amountIn, uint256 amountOut);

    function initialize(address _stableCoin, address _uniswapRouter, address _oracle, address _treasury, address _permit2) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PORTFOLIO_MANAGER_ROLE, msg.sender);

        stableCoin = IERC20Upgradeable(_stableCoin);
        uniswapRouter = IUniswapV4Router(_uniswapRouter);
        priceOracle = IOracle(_oracle);
        permit2 = IPermit2(_permit2);
        treasury = _treasury;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function _swapExactInputSingle(PoolKey memory key, bool zeroForOne, uint128 amountIn, uint128 minAmountOut) internal returns (uint256 amountOut) {
        permit2.approve(address(zeroForOne ? key.currency0 : key.currency1), address(universalRouter), amountIn, uint48(block.timestamp + 1 hours));

        bytes memory commands = abi.encodePacked(uint8(Commands.V4_SWAP));
        bytes[] memory inputs = new bytes[](1);

        bytes memory actions = abi.encodePacked(
            uint8(Actions.SWAP_EXACT_IN_SINGLE),
            uint8(Actions.SETTLE_ALL),
            uint8(Actions.TAKE_ALL)
        );

        bytes ;
        params[0] = abi.encode(
            IV4SwapRouter.ExactInputSingleParams({
                poolKey: key,
                zeroForOne: zeroForOne,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                hookData: ""
            })
        );
        params[1] = abi.encode(key.currency0, amountIn);
        params[2] = abi.encode(key.currency1, minAmountOut);

        inputs[0] = abi.encode(actions, params);

        universalRouter.execute(commands, inputs, block.timestamp);

        amountOut = IERC20Upgradeable(address(zeroForOne ? key.currency1 : key.currency0)).balanceOf(address(this));
        require(amountOut >= minAmountOut, "Insufficient output amount");
    }

    function invest(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        stableCoin.safeTransferFrom(msg.sender, address(this), amount);

        uint256 sharesToMint = totalShares == 0 ? amount : (amount * totalShares) / getPortfolioValue();
        userShares[msg.sender] += sharesToMint;
        userInvestedAmount[msg.sender] += amount;
        totalShares += sharesToMint;

        uint256 totalPortfolioValue = getPortfolioValue();

        for (uint256 i = 0; i < portfolioAssets.length; i++) {
            address asset = portfolioAssets[i];
            uint256 assetValue = _getAssetValue(asset);
            uint256 assetShare = (assetValue * 1e18) / totalPortfolioValue;

            uint256 amountToInvest = (amount * assetShare) / 1e18;
            if (amountToInvest > 0) {
                PoolKey memory key = PoolKey({
                    currency0: address(stableCoin),
                    currency1: asset,
                    fee: 3000,
                    tickSpacing: 60,
                    hooks: address(0)
                });
                _swapExactInputSingle(key, true, uint128(amountToInvest), 0);
            }
        }

        emit Invest(msg.sender, amount);
    }


    function withdraw(uint256 basisPoints) external nonReentrant whenNotPaused {
        require(basisPoints > 0 && basisPoints <= 10000, "Invalid percentage");
        uint256 userShare = userShares[msg.sender];
        require(userShare > 0, "No shares to withdraw");

        uint256 withdrawShares = (userShare * basisPoints) / 10000;
        uint256 portfolioValue = getPortfolioValue();
        uint256 amountStable = (withdrawShares * portfolioValue) / totalShares;

        require(withdrawShares <= userShare, "Insufficient share");

        uint256 totalSharesPortfolio = (withdrawShares * 10000) / totalShares;

        userShares[msg.sender] -= withdrawShares;
        totalShares -= withdrawShares;

        for (uint256 i = 0; i < portfolioAssets.length; i++) {
            address asset = portfolioAssets[i];
            uint256 assetBalance = IERC20Upgradeable(asset).balanceOf(address(this));
            uint256 amountToSell = (assetBalance * totalSharesPortfolio) / 10000;
            if (amountToSell > 0) {
                PoolKey memory key = PoolKey({
                    currency0: asset,
                    currency1: address(stableCoin),
                    fee: 3000,
                    tickSpacing: 60,
                    hooks: address(0)
                });
                _swapExactInputSingle(key, true, uint128(amountToSell), 0);
            }
        }

        uint256 invested = (userInvestedAmount[msg.sender] * withdrawShares) / userShare;
        uint256 gain = amountStable > invested ? amountStable - invested : 0;
        uint256 fee = (gain * 5) / 100;
        uint256 amountToUser = amountStable - fee;

        stableCoin.safeTransfer(msg.sender, amountToUser);
        if (fee > 0) {
            stableCoin.safeTransfer(treasury, fee);
        }

        userInvestedAmount[msg.sender] -= invested;

        emit Withdraw(msg.sender, amountStable, amountToUser, fee);
    }

    function _liquidateToStable(uint256 portfolioBasisPoints) internal {
        uint256 assetCount = portfolioAssets.length;
        for (uint256 i = 0; i < assetCount; i++) {
            address asset = portfolioAssets[i];
            IERC20Upgradeable token = IERC20Upgradeable(asset);
            uint256 balance = token.balanceOf(address(this));
            if (balance == 0) continue;

            uint256 amountToSell = (balance * portfolioBasisPoints) / 10000;
            address[] memory path = new address[](2);
            path[0] = asset;
            path[1] = address(stableCoin);

            permit2.approve(asset, address(uniswapRouter), uint160(amountToSell), uint48(block.timestamp + 1 hours));
            uint[] memory amounts = uniswapRouter.swapExactTokensForTokens(
                amountToSell,
                0,
                path,
                address(this),
                block.timestamp
            );

            emit AssetSwapped(asset, address(stableCoin), amounts[0], amounts[amounts.length - 1]);
        }
    }

    function _getAssetValue(address asset) internal view returns (uint256) {
        uint256 balance = IERC20Upgradeable(asset).balanceOf(address(this));
        uint256 price = priceOracle.getPrice(asset);
        return (balance * price) / 1e18;
    }

    function getUserShareValue(address user) public view returns (uint256) {
        return (userShares[user] * getPortfolioValue()) / totalShares;
    }

    function getPortfolioValue() public view returns (uint256) {
        uint256 total = stableCoin.balanceOf(address(this));
        for (uint256 i = 0; i < portfolioAssets.length; i++) {
            address asset = portfolioAssets[i];
            total += _getAssetValue(asset);
        }
        return total;
    }

    function rebalance(address[] calldata sellAssets, uint256[] calldata sellAmounts, address[] calldata buyAssets, uint256[] calldata buyAmounts) external onlyRole(PORTFOLIO_MANAGER_ROLE) whenNotPaused {
        require(sellAssets.length == sellAmounts.length && buyAssets.length == buyAmounts.length, "Array length mismatch");

        for (uint256 i = 0; i < sellAssets.length; i++) {
            PoolKey memory key = PoolKey({
                currency0: sellAssets[i],
                currency1: address(stableCoin),
                fee: 3000,
                tickSpacing: 60,
                hooks: address(0)
            });
            _swapExactInputSingle(key, true, uint128(sellAmounts[i]), 0);
        }

        uint256 stableBalance = stableCoin.balanceOf(address(this));

        for (uint256 i = 0; i < buyAssets.length; i++) {
            uint256 amount = buyAmounts[i];
            if (amount > stableBalance) {
                amount = stableBalance;
            }
            if (amount == 0) continue;

            PoolKey memory key = PoolKey({
                currency0: address(stableCoin),
                currency1: buyAssets[i],
                fee: 3000,
                tickSpacing: 60,
                hooks: address(0)
            });
            _swapExactInputSingle(key, true, uint128(amount), 0);
            stableBalance -= amount;
        }

        emit Rebalanced(sellAssets, buyAssets);
    }



    function setPortfolioAssets(address[] calldata assets) external onlyRole(PORTFOLIO_MANAGER_ROLE) {
        portfolioAssets = assets;
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
