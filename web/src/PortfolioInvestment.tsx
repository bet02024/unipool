import { useState, useEffect, ChangeEvent } from 'react';
import { ethers } from 'ethers';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import contractABI from './abi/PortfolioAbi.json';
import { config } from './config';

const contractAddress = config.contractAddress as string;
declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function PortfolioInvestment() {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  const [amount, setAmount] = useState<string>('');
  const [basisPoints, setBasisPoints] = useState<string>('');
  const [assets, setAssets] = useState<string[]>([]);
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null);
  const [shareValue, setShareValue] = useState<number | null>(null);

  // Connect wallet
  async function connectWallet() {
    if (window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      setAccount(await signer.getAddress());
      const network = await provider.getNetwork();
      setChainId(Number(network.chainId));
    } else {
      alert('Please install MetaMask!');
    }
  }

  // Disconnect wallet
  function disconnectWallet() {
    setAccount(null);
    setChainId(null);
  }

  // Check network
  useEffect(() => {
    if (chainId && chainId !== config.chainId) {
      alert(`Please switch to ${config.networkName}`);
    }
  }, [chainId]);

  // Load user share, portfolio assets, and value
  async function loadPortfolioData(signerOrProvider: ethers.Provider | ethers.Signer, userAddress: string) {
    const contract = new ethers.Contract(contractAddress, contractABI, signerOrProvider);

    // Get user share value
    try {
      const sv = await contract.getUserShareValue(userAddress);
      setShareValue(Number(ethers.formatUnits(sv, 6)));
    } catch {}

    // Get all assets (this assumes the assets are strings or addresses)
    try {
      const assetsArr = await contract.portfolioAssets();
      setAssets(Array.isArray(assetsArr) ? assetsArr : []);
    } catch {}

    // Get portfolio total value
    try {
      const pv = await contract.getPortfolioValue();
      setPortfolioValue(Number(ethers.formatUnits(pv, 6)));
    } catch {}
  }

  useEffect(() => {
    if (account) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      provider.getSigner().then((signer) => {
        loadPortfolioData(signer, account);
      });
    }
    // eslint-disable-next-line
  }, [account]);

  // Invest function
  async function handleInvest() {
    if (!account) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      const tx = await contract.invest(ethers.parseUnits(amount || '0', 6));
      await tx.wait();
      alert('Invest successful');
      loadPortfolioData(signer, account);
    } catch (err: any) {
      alert(`Invest failed: ${err?.reason || err?.message || String(err)}`);
    }
  }

  // Withdraw function
  async function handleWithdraw() {
    if (!account) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, contractABI, signer);
      const tx = await contract.withdraw(Number(basisPoints));
      await tx.wait();
      alert('Withdraw successful');
      loadPortfolioData(signer, account);
    } catch (err: any) {
      alert(`Withdraw failed: ${err?.reason || err?.message || String(err)}`);
    }
  }

  return (
    <Box sx={{ p: 4, maxWidth: 600, margin: '0 auto', background: '#111', color: '#fff', minHeight: '100vh', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid #333', pb: 2 }}>
        <img src="/logo.png" alt="App Logo" style={{ width: 40, height: 40, borderRadius: 8 }} />
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Astro Portfolio</Typography>
      </Box>
      {!account ? (
        <Button variant="contained" color="primary" sx={{ my: 2 }} onClick={connectWallet}>
          Connect Wallet
        </Button>
      ) : (
        <Button variant="contained" color="secondary" sx={{ my: 2 }} onClick={disconnectWallet}>
          Disconnect
        </Button>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography variant="subtitle2">Investment Amount (USDT):</Typography>
          <TextField
            value={amount}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
            type="number"
            variant="outlined"
            size="small"
            placeholder="e.g., 100"
            inputProps={{ style: { color: '#fff', borderColor: '#fff' } }}
            sx={{ my: 1, input: { color: '#fff' }, label: { color: '#fff' } }}
          />
          <Button variant="contained" color="success" onClick={handleInvest} disabled={!account || !amount}>Invest</Button>
        </Box>
        <Box>
          <Typography variant="subtitle2">Withdraw (% in basis points):</Typography>
          <TextField
            type="number"
            placeholder="e.g., 5000"
            value={basisPoints}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setBasisPoints(e.target.value)}
            variant="outlined"
            size="small"
            inputProps={{ style: { color: '#fff', borderColor: '#fff' } }}
            sx={{ my: 1, input: { color: '#fff' }, label: { color: '#fff' } }}
          />
          <Button variant="contained" color="error" onClick={handleWithdraw} disabled={!account || !basisPoints}>Withdraw</Button>
        </Box>
        <Box>
          {shareValue !== null && (
            <Typography variant="body2">Your share value: {shareValue.toFixed(2)} USDT</Typography>
          )}
        </Box>
      </Box>
      <Box sx={{ mt: 4 }}>
        <Typography variant="h6">📦 Current Portfolio</Typography>
        {assets && assets.length > 0 ? (
          <ul>
            {assets.map((asset, idx) => (
              <li key={idx}>{asset}</li>
            ))}
          </ul>
        ) : (
          <Typography variant="body2">No assets in portfolio.</Typography>
        )}
        {portfolioValue !== null && (
          <Typography sx={{ mt: 1 }} variant="body1">Total portfolio value: {portfolioValue.toFixed(2)} USDT</Typography>
        )}
      </Box>
    </Box>
  );
}
