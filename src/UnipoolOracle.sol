// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title UnipoolOracle
 * @dev Price oracle that can be manually updated by Unipool
 * @notice All prices are based on USDC with 6 decimals
 */
contract UnipoolOracle is Ownable {
    
    // Structure to store price information
    struct PriceInfo {
        uint256 price;           // Price in USDC (6 decimals)
        uint256 lastUpdated;     // Timestamp of last update
        bool isActive;           // Whether the token is active
    }
    
    // Mapping from token to price information
    mapping(address => PriceInfo) public tokenPrices;
    
    // Array of supported tokens
    address[] public supportedTokens;
    // Mapping to check if a token already exists in the array
    mapping(address => bool) public tokenExists;
    // Maximum price validity time (24 hours by default)
    uint256 public maxPriceAge = 24 hours;
     
    
    // Events
    event PricesUpdated(address[] tokens, uint256[] prices, uint256 timestamp);
    event TokenAdded(address indexed token);
    event TokenDeactivated(address indexed token);
    event TokenActivated(address indexed token);
    event MaxPriceAgeUpdated(uint256 oldAge, uint256 newAge);
    event EmergencyPriceUpdate(address indexed token, uint256 price);
    
    // Custom errors
    error TokenNotFound(address token);
    error TokenNotActive(address token);
    error PriceExpired(address token, uint256 lastUpdated);
    error InvalidArrayLength();
    error InvalidPrice(uint256 price);
    error InvalidToken(address token);
    error TokenAlreadyExists(address token);
    error InvalidMaxAge(uint256 age);
    
    constructor()  Ownable(msg.sender) {
    }
    
    /**
     * @dev Updates prices for multiple tokens
     * @param tokens Array of token addresses
     * @param prices Array of prices in USDC (6 decimals)
     */
    function update(
        address[] calldata tokens,
        uint256[] calldata prices
    ) external onlyOwner  {
        if (tokens.length != prices.length) {
            revert InvalidArrayLength();
        }
        if (tokens.length == 0) {
            revert InvalidArrayLength();
        }
        
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 price = prices[i];
            
            if (token == address(0)) {
                revert InvalidToken(token);
            }
            if (price == 0) {
                revert InvalidPrice(price);
            }
            // If token doesn't exist, add it
            if (!tokenExists[token]) {
                _addToken(token);
            }
            // Update price
            tokenPrices[token] = PriceInfo({
                price: price,
                lastUpdated: block.timestamp,
                isActive: true
            });
        }
        emit PricesUpdated(tokens, prices, block.timestamp);
    }
    
    /**
     * @dev Gets the price of a token
     * @param token Token address
     * @return price Price in USDC (6 decimals)
     */
    function getPrice(address token) external view returns (uint256 price) {
        PriceInfo memory priceInfo = tokenPrices[token];
        if (!tokenExists[token]) {
            revert TokenNotFound(token);
        }
        if (!priceInfo.isActive) {
            revert TokenNotActive(token);
        }
        if (block.timestamp - priceInfo.lastUpdated > maxPriceAge) {
            revert PriceExpired(token, priceInfo.lastUpdated);
        }
        return priceInfo.price;
    }
    
    /**
     * @dev Gets complete price information for a token
     * @param token Token address
     * @return price Price in USDC
     * @return lastUpdated Timestamp of last update
     * @return isActive Whether the token is active
     * @return isExpired Whether the price has expired
     */
    function getPriceInfo(address token) 
        external 
        view 
        returns (
            uint256 price,
            uint256 lastUpdated,
            bool isActive,
            bool isExpired
        ) 
    {
        if (!tokenExists[token]) {
            revert TokenNotFound(token);
        }
        PriceInfo memory priceInfo = tokenPrices[token];
        return (
            priceInfo.price,
            priceInfo.lastUpdated,
            priceInfo.isActive,
            block.timestamp - priceInfo.lastUpdated > maxPriceAge
        );
    }
     
    
    /**
     * @dev Gets all active supported tokens
     * @return tokens Array of active token addresses
     */
    function getActiveTokens() external view returns (address[] memory tokens) {
        uint256 activeCount = 0;
        
        // Count active tokens
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            if (tokenPrices[supportedTokens[i]].isActive) {
                activeCount++;
            }
        }
        // Create array with active tokens
        tokens = new address[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            if (tokenPrices[supportedTokens[i]].isActive) {
                tokens[index] = supportedTokens[i];
                index++;
            }
        }
        return tokens;
    }
    
 
    
    /**
     * @dev Reactivates / Deactivate a token
     * @param token token address
     */
    function updateTokenStatus(address token, bool state) external onlyOwner {
        if (!tokenExists[token]) {
            revert TokenNotFound(token);
        }
        tokenPrices[token].isActive = state;
        if (state){
            emit TokenActivated(token);
        } else {
            emit TokenDeactivated(token);
        }
    }
      
    
    /**
     * @dev add new token
     * @param token token address
     */
    function _addToken(address token) internal {
        if (tokenExists[token]) {
            revert TokenAlreadyExists(token);
        }
        supportedTokens.push(token);
        tokenExists[token] = true;
        emit TokenAdded(token);
    }
      
    /**
     * @dev Checkif a token is the Oracle
     * @param token token address
     * @return exists bool
     */
    function tokenSupported(address token) external view returns (bool exists) {
        return tokenExists[token];
    }

}