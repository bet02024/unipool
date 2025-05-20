import { useState, useEffect } from 'react';
import { useAccount, useNetwork, useContractWrite, useContractRead, usePrepareContractWrite, useConnect } from 'wagmi';
import { InjectedConnector } from 'wagmi/connectors/injected';
import { WalletConnectConnector } from 'wagmi/connectors/walletConnect';
import { parseUnits } from 'viem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'react-toastify';
import { Loader2 } from 'lucide-react';
import contractABI from '../abis/PortfolioInvestment.json';
import { config } from '../config';

export default function PortfolioInvestment() {
  const { address, isConnected } = useAccount();
  const { chain } = useNetwork();
  const [amount, setAmount] = useState('');
  const [basisPoints, setBasisPoints] = useState('');

  const [assets, setAssets] = useState([]);
  const [portfolioValue, setPortfolioValue] = useState(null);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const { connect } = useConnect({
    connectors: [
      new InjectedConnector(),
      new WalletConnectConnector({
        options: {
          projectId: 'your-walletconnect-project-id',
        },
      }),
    ],
  });

  useEffect(() => {
    if (chain && chain.id !== config.chainId) {
      toast.error(`Please switch to ${config.networkName}`);
    }
  }, [chain]);

  const { config: investConfig } = usePrepareContractWrite({
    address: config.contractAddress,
    abi: contractABI,
    functionName: 'invest',
    args: [parseUnits(amount || '0', 6)],
    enabled: Boolean(amount) && chain?.id === config.chainId,
  });

  const { config: withdrawConfig } = usePrepareContractWrite({
    address: config.contractAddress,
    abi: contractABI,
    functionName: 'withdraw',
    args: [Number(basisPoints)],
    enabled: Boolean(basisPoints) && chain?.id === config.chainId,
  });

  const { data: shareValue } = useContractRead({
    address: config.contractAddress,
    abi: contractABI,
    functionName: 'getUserShareValue',
    args: [address],
    watch: true,
  });

  const { data: fetchedAssets, isLoading: loadingFetchedAssets } = useContractRead({
    address: config.contractAddress,
    abi: contractABI,
    functionName: 'portfolioAssets',
    watch: true,
  });

  const { data: fetchedValue, isLoading: loadingFetchedValue } = useContractRead({
    address: config.contractAddress,
    abi: contractABI,
    functionName: 'getPortfolioValue',
    watch: true,
  });

  useEffect(() => {
    setLoadingAssets(loadingFetchedAssets || loadingFetchedValue);
    if (fetchedAssets) setAssets(fetchedAssets);
    if (fetchedValue) setPortfolioValue(parseFloat(fetchedValue.toString()) / 1e6);
  }, [fetchedAssets, fetchedValue, loadingFetchedAssets, loadingFetchedValue]);

  const { write: invest } = useContractWrite({
    ...investConfig,
    onError: (err) => toast.error(`Invest failed: ${err.message}`),
    onSuccess: () => toast.success('Invest successful'),
  });

  const { write: withdraw } = useContractWrite({
    ...withdrawConfig,
    onError: (err) => toast.error(`Withdraw failed: ${err.message}`),
    onSuccess: () => toast.success('Withdraw successful'),
  });

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6 bg-black text-white min-h-screen">
      <div className="flex items-center space-x-4 border-b border-gray-700 pb-4">
        <img src="/logo.png" alt="App Logo" className="w-10 h-10 rounded" />
        <h1 className="text-2xl font-bold">Astro Portfolio</h1>
      </div>
            {!isConnected && <Button$1 className="bg-white text-black hover:bg-gray-200"> connect()}>Connect Wallet</Button>}

      <div className="space-y-4">
        <div>
          <label className="block text-white">Investment Amount (in Stablecoin - USDT):</label>
          <Input$1 className="bg-black border border-white text-white placeholder-gray-400" />
          <Button onClick={() => invest?.()}>Invest</Button>
        </div>

        <div>
          <label>Withdraw (% in basis points):</label>
          <Input
            type="number"
            placeholder="e.g., 5000"
            value={basisPoints}
            onChange={(e) => setBasisPoints(e.target.value)}
          />
          <Button onClick={() => withdraw?.()}>Withdraw</Button>
        </div>

        <div className="pt-4">
          {shareValue && (
            <p className="text-white">Your share value: {parseFloat(shareValue.toString()) / 1e6} USDT</p>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-semibold">📦 Current Portfolio</h2>
        {loadingAssets ? (
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <Loader2 className="animate-spin w-5 h-5" />
            <span>Loading assets...</span>
          </div>
        ) : assets && assets.length > 0 ? (
          <ul className="list-disc list-inside">
            {assets.map((asset, idx) => (
              <li key={idx}>{asset}</li>
            ))}
          </ul>
        ) : (
          <p>No assets in portfolio.</p>
        )}
        {portfolioValue !== null && !loadingAssets && (
          <p className="mt-2 font-medium">Total portfolio value: {portfolioValue.toFixed(2)} USDT</p>
        )}
      </div>
    </div>
  );
}
