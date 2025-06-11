import React, { useState, useEffect } from 'react';
import { Wallet, TrendingUp, PieChart, ArrowUpRight, ArrowDownRight, Users, DollarSign, Activity, RefreshCw } from 'lucide-react';
import { BrowserProvider, Contract, ethers } from 'ethers';

// Configuration
const CONFIG = {
  contractAddress: '0x742d35Cc6634C0532925a3b8D400a83b7b8C1B21',
  networkId: 1, // Ethereum Mainnet
  networkName: 'Ethereum Mainnet',
  rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/your-api-key'
};

const CONTRACT_ABI = [
  {
    "type": "function",
    "name": "assetBalances",
    "inputs": [{"name": "", "type": "address[]", "internalType": "address[]"}],
    "outputs": [{"name": "", "type": "uint256[]", "internalType": "uint256[]"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "portfolioAssets",
    "inputs": [],
    "outputs": [{"name": "", "type": "address[]", "internalType": "address[]"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPortfolioValue",
    "inputs": [],
    "outputs": [{"name": "", "type": "uint256", "internalType": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getUserShareValue",
    "inputs": [{"name": "user", "type": "address", "internalType": "address"}],
    "outputs": [{"name": "", "type": "uint256", "internalType": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "invest",
    "inputs": [{"name": "amount", "type": "uint256", "internalType": "uint256"}],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "stableCoin",
    "inputs": [],
    "outputs": [{"name": "", "type": "address", "internalType": "contract IERC20"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalShares",
    "inputs": [],
    "outputs": [{"name": "", "type": "uint256", "internalType": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "userInvestedAmount",
    "inputs": [{"name": "", "type": "address", "internalType": "address"}],
    "outputs": [{"name": "", "type": "uint256", "internalType": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "userShares",
    "inputs": [{"name": "", "type": "address", "internalType": "address"}],
    "outputs": [{"name": "", "type": "uint256", "internalType": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "withdraw",
    "inputs": [{"name": "basisPoints", "type": "uint256", "internalType": "uint256"}],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
];


export default function UnipoolPortfolioDApp() {
  const [account, setAccount] = useState('');
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [networkError, setNetworkError] = useState('');
  
  // User data
  const [userShares, setUserShares] = useState('0');
  const [userShareValue, setUserShareValue] = useState('0');
  const [userInvestedAmount, setUserInvestedAmount] = useState('0');
  
  // Protocol data
  const [portfolioValue, setPortfolioValue] = useState('0');
  const [totalShares, setTotalShares] = useState('0');
  const [portfolioAssets, setPortfolioAssets] = useState([]);
  
  // Form states
  const [investAmount, setInvestAmount] = useState('');
  const [withdrawPercent, setWithdrawPercent] = useState('');

  // Connect Wallet
  const connectWallet = async () => {
    try {
      setLoading(true);
      setError('');
      
      if (!ethers) {
        setError('Ethers library not loaded');
        return;
      }
      
      if (!window.ethereum) {
        throw new Error('MetaMask not installed');
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);

      const accounts = await provider.send("eth_requestAccounts", []);
      const network = await provider.getNetwork();
      
      if (Number(network.chainId) !== CONFIG.networkId) {
        setNetworkError(`Please switch to ${CONFIG.networkName}`);
        await switchNetwork();
        return;
      }
      
      setNetworkError('');
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONFIG.contractAddress, CONTRACT_ABI, signer);
      
      setProvider(provider);
      setContract(contract);
      setAccount(accounts[0]);
      
      await loadData(contract, accounts[0]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Switch Network
  const switchNetwork = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${CONFIG.networkId.toString(16)}` }]
      });
      setTimeout(connectWallet, 1000);
    } catch (err) {
      setError('Failed to switch network');
    }
  };

  // Load contract data
  const loadData = async (contractInstance, userAccount) => {
    if (!ethers) return;
    
    try {
      const [
        userSharesData,
        userShareValueData,
        userInvestedData,
        portfolioValueData,
        totalSharesData
      ] = await Promise.all([
        contractInstance.userShares(userAccount),
        contractInstance.getUserShareValue(userAccount),
        contractInstance.userInvestedAmount(userAccount),
        contractInstance.getPortfolioValue(),
        contractInstance.totalShares()
      ]);

      setUserShares(ethers.formatEther(userSharesData));
      setUserShareValue(ethers.formatEther(userShareValueData));
      setUserInvestedAmount(ethers.formatEther(userInvestedData));
      setPortfolioValue(ethers.formatEther(portfolioValueData));
      setTotalShares(ethers.formatEther(totalSharesData));

      // Load portfolio assets - now returns an array of assets
      try {
        const assetAddresses = await contractInstance.portfolioAssets();
        if (assetAddresses && assetAddresses.length > 0) {
          const assetBalances = await contractInstance.assetBalances(assetAddresses);
          
          const assets = assetAddresses.map((address, index) => ({
            address: address,
            balance: ethers.formatEther(assetBalances[index] || 0),
            symbol: `TOKEN${index + 1}` // In real app, you'd fetch symbol from token contract
          }));
          
          setPortfolioAssets(assets);
        } else {
          setPortfolioAssets([]);
        }
      } catch (err) {
        console.log('Error loading assets:', err);
        setPortfolioAssets([]);
      }
    } catch (err) {
      setError('Failed to load data');
    }
  };

  // Invest
  const handleInvest = async () => {
    if (!contract || !investAmount || !ethers) return;
    
    try {
      setLoading(true);
      const amount = ethers.parseEther(investAmount);
      const tx = await contract.invest(amount);
      await tx.wait();
      
      setInvestAmount('');
      await loadData(contract, account);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Withdraw
  const handleWithdraw = async () => {
    if (!contract || !withdrawPercent) return;
    
    try {
      setLoading(true);
      const basisPoints = Math.floor(parseFloat(withdrawPercent) * 100);
      const tx = await contract.withdraw(basisPoints);
      await tx.wait();
      
      setWithdrawPercent('');
      await loadData(contract, account);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Refresh data
  const refreshData = async () => {
    if (contract && account) {
      await loadData(contract, account);
    }
  };

  useEffect(() => {
    // Load ethers library on component mount
    loadEthers()
      .then(setEthers)
      .catch(err => setError('Failed to load ethers library'));
      
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          setAccount('');
          setContract(null);
        } else {
          setAccount(accounts[0]);
          if (contract) loadData(contract, accounts[0]);
        }
      });

      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }
  }, [contract]);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <PieChart className="h-8 w-8 text-white" />
              <h1 className="text-2xl font-bold">Unipool Portfolio</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {account && (
                <button
                  onClick={refreshData}
                  className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
              )}
              
              {!account ? (
                <button
                  onClick={connectWallet}
                  disabled={loading}
                  className="flex items-center space-x-2 bg-white text-black px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  <Wallet className="h-5 w-5" />
                  <span>{loading ? 'Connecting...' : 'Connect Wallet'}</span>
                </button>
              ) : (
                <div className="flex items-center space-x-2 bg-gray-800 px-4 py-2 rounded-lg">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm">{account.slice(0, 6)}...{account.slice(-4)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Error Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-900 border border-red-700 rounded-lg">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {networkError && (
          <div className="mb-6 p-4 bg-yellow-900 border border-yellow-700 rounded-lg">
            <p className="text-yellow-200">{networkError}</p>
            <button
              onClick={switchNetwork}
              className="mt-2 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
            >
              Switch Network
            </button>
          </div>
        )}

        {!account ? (
          <div className="text-center py-20">
            <Wallet className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h2 className="text-2xl font-semibold mb-2">Connect Your Wallet</h2>
            <p className="text-gray-400 mb-8">Connect your wallet to start investing in the portfolio</p>
            <button
              onClick={connectWallet}
              disabled={loading}
              className="bg-white text-black px-8 py-3 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {loading ? 'Connecting...' : 'Connect Wallet'}
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Protocol Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-400">Total Portfolio Value</h3>
                  <DollarSign className="h-5 w-5 text-green-500" />
                </div>
                <p className="text-2xl font-bold">${parseFloat(portfolioValue).toLocaleString()}</p>
              </div>
              
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-400">Total Shares</h3>
                  <Users className="h-5 w-5 text-blue-500" />
                </div>
                <p className="text-2xl font-bold">{parseFloat(totalShares).toLocaleString()}</p>
              </div>
              
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-400">Portfolio Assets</h3>
                  <Activity className="h-5 w-5 text-purple-500" />
                </div>
                <p className="text-2xl font-bold">{portfolioAssets.length}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* User Portfolio */}
              <div className="space-y-6">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h2 className="text-xl font-semibold mb-6 flex items-center">
                    <TrendingUp className="h-6 w-6 mr-2" />
                    Your Portfolio
                  </h2>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-4 bg-gray-800 rounded-lg">
                      <span className="text-gray-400">Your Shares</span>
                      <span className="font-semibold">{parseFloat(userShares).toFixed(4)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center p-4 bg-gray-800 rounded-lg">
                      <span className="text-gray-400">Share Value</span>
                      <span className="font-semibold text-green-500">${parseFloat(userShareValue).toFixed(2)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center p-4 bg-gray-800 rounded-lg">
                      <span className="text-gray-400">Invested Amount</span>
                      <span className="font-semibold">${parseFloat(userInvestedAmount).toFixed(2)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center p-4 bg-gray-800 rounded-lg">
                      <span className="text-gray-400">P&L</span>
                      <span className={`font-semibold ${
                        parseFloat(userShareValue) > parseFloat(userInvestedAmount) ? 'text-green-500' : 'text-red-500'
                      }`}>
                        ${(parseFloat(userShareValue) - parseFloat(userInvestedAmount)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Investment Actions */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold mb-4">Actions</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">
                        Invest Amount (ETH)
                      </label>
                      <div className="flex space-x-3">
                        <input
                          type="number"
                          value={investAmount}
                          onChange={(e) => setInvestAmount(e.target.value)}
                          placeholder="0.0"
                          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-white"
                        />
                        <button
                          onClick={handleInvest}
                          disabled={loading || !investAmount}
                          className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 rounded-lg transition-colors"
                        >
                          <ArrowUpRight className="h-4 w-4" />
                          <span>Invest</span>
                        </button>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">
                        Withdraw Percentage (%)
                      </label>
                      <div className="flex space-x-3">
                        <input
                          type="number"
                          value={withdrawPercent}
                          onChange={(e) => setWithdrawPercent(e.target.value)}
                          placeholder="0-100"
                          max="100"
                          min="0"
                          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-white"
                        />
                        <button
                          onClick={handleWithdraw}
                          disabled={loading || !withdrawPercent}
                          className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 rounded-lg transition-colors"
                        >
                          <ArrowDownRight className="h-4 w-4" />
                          <span>Withdraw</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Portfolio Assets */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-xl font-semibold mb-6 flex items-center">
                  <PieChart className="h-6 w-6 mr-2" />
                  Portfolio Assets
                </h2>
                
                {portfolioAssets.length > 0 ? (
                  <div className="space-y-4">
                    {portfolioAssets.map((asset, index) => (
                      <div key={index} className="p-4 bg-gray-800 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium">{asset.symbol}</span>
                          <span className="text-sm text-gray-400">Balance</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400 font-mono">
                            {asset.address.slice(0, 6)}...{asset.address.slice(-4)}
                          </span>
                          <span className="font-semibold">{parseFloat(asset.balance).toFixed(4)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <PieChart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No assets found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}