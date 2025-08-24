import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowDown, Activity, Shield, DollarSign, FileText, Wifi, WifiOff } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import Web3 from 'web3';

type AgentLog = {
  timestamp: string;
  message: string;
};

type AgentState = {
  status: string;
  logs: AgentLog[];
};

type Portfolio = {
  [name: string]: number;
};

type UnipoolState = {
  portfolio: Portfolio;
  logs: AgentLog[];
};

type AgentCardProps = {
  name: string;
  icon: ReactNode;
  status: string;
  logs: AgentLog[];
};

type UnipoolContractUIProps = {
};

// @ts-expect-error
const ERC20_ABI: any = [
  { "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
  { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "type": "function" },
  { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
  { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "type": "function" },
];

const WEB3_RPC: string = 'https://unichain-mainnet.infura.io/v3/26R21SZqpvCe4I4tByOc41h4p8h';

const COINGECKO_API: string = 'https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&symbols=';

const MCP_SERVER_URL: string = "http://127.0.0.1:5001";

const ASSET_BALANCES_ENDPOINT: string = `${MCP_SERVER_URL}/contract/asset-balances`;

const CG_API_KEY: string =  "CG-XftMymJT5BMWYsLNRakRyERP";
const UNIPOOL_CONTRACT_ADDRESS: string =  "0xc79AB5D4544E50Db86061cF34908Ea42ADc2EDda";


console.log("UNIPOOL_CONTRACT_ADDRESS");

console.log(UNIPOOL_CONTRACT_ADDRESS);

function convertKeysToLowercase(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => convertKeysToLowercase(item));
  }
  const newObj: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const lowerCaseKey = key.toLowerCase();
      newObj[lowerCaseKey] = convertKeysToLowercase(obj[key]);
    }
  }
  return newObj;
}

const AgentCard: React.FC<AgentCardProps> = ({ name, icon, status, logs }) => (
  <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg flex flex-col">
    <div className="p-4 border-b border-gray-700 flex items-center space-x-3">
      {icon}
      <h3 className="text-xl font-bold text-white">{name}</h3>
    </div>
    <div className="p-4">
      <p className="text-sm font-medium text-cyan-400 mb-2">Latest Activity:</p>
      <p className="text-md text-white h-11">{status}</p>
    </div>
    <div className="p-4 flex-grow">
      <p className="text-sm font-medium text-cyan-400 mb-2">Event Log:</p>
      <div className="bg-gray-900 rounded-md p-2 h-48 overflow-y-auto text-xs font-mono text-gray-400 space-y-1">
        {logs.map((log, i) => <p key={i} className="whitespace-pre-wrap">{`[${log.timestamp}] ${log.message}`}</p>)}
      </div>
    </div>
  </div>
);




const UnipoolContractUI: React.FC<UnipoolContractUIProps> = () => {

    const [totalPortfolioValue, setTotalPortfolioValue] = useState<number|string>(0);

    const [portfolioData, setPortfolioData] = useState<[]>([]);


    const [unipool, setUnipool] = useState<UnipoolState>({
        portfolio: {},
        logs: [],
    });

    //const portfolioData = Object.entries(unipool.portfolio)

   
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF42A1'];
    const RADIAN = Math.PI / 180;


    const fetchPortfolio = useCallback(async () => {
        try {
          const res = await fetch(ASSET_BALANCES_ENDPOINT);
          const data = await res.json();
          if (!data.success) throw new Error(data.error || "Unknown error fetching assets");
          const assets = data.assets;
          if (assets.length === 0) {
            setUnipool(prev => ({ ...prev, portfolio: {} }));
            return;
          }
          const web3 = new Web3(WEB3_RPC);
          const details = await Promise.all(assets.map(async (item: any) => {
            try {
              const contract = new web3.eth.Contract(ERC20_ABI, item.address);
              const [name, symbol, decimals, balance] = await Promise.all([
                contract.methods.name().call(),
                contract.methods.symbol().call(),
                contract.methods.decimals().call(),
                contract.methods.balanceOf(UNIPOOL_CONTRACT_ADDRESS).call(),
              ]);
              return { ...item, name, symbol, decimals: Number(decimals), coingecko_id: symbol.toLowerCase(), balance };
            } catch (e) {
              console.log("##### ERRORR ######");
              console.log(e);
              return { ...item, name: item.address.slice(0,6) + "..." + item.address.slice(-4), symbol: item.address, decimals: 18, coingecko_id: null, balance: 0 };
            }
          }));
          const idToAsset: Record<string, any> = {};
          const ids: string[] = [];
          details.forEach((item: any) => {
            if (item.coingecko_id) {
              ids.push(item.coingecko_id);
              idToAsset[item.coingecko_id] = item;
            }
          });
          const priceURL = `${COINGECKO_API}${ids.join(",")}`;
          const priceResp = await fetch(priceURL, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'x-cg-demo-api-key': CG_API_KEY
            }
          });
          const prices = await priceResp.json();
          const prices_lower = convertKeysToLowercase(prices);
    
          let totalUSD = 0;
          const assetValues = details.map((item: any) => {
            const amount = Number(item.balance) / 10 ** item.decimals;
            const priceUSD = item.coingecko_id && prices_lower[item.coingecko_id] ? Number(prices_lower[item.coingecko_id].usd) : 0;
            const valueUSD = amount * priceUSD;
            totalUSD += valueUSD;
            return { ...item, amount, priceUSD, valueUSD };
          });
          setTotalPortfolioValue(totalUSD.toFixed(2));
          let _portfolio: Portfolio = {};
          assetValues.forEach((item: any) => {
            if (item.valueUSD && totalUSD > 0) {
                _portfolio[item.name + " Value $" + String(item.valueUSD.toFixed(2))] = (item.valueUSD * 100 / totalUSD);
            }
          });

          setPortfolioData( Object.entries(_portfolio)
            .filter(([, value]) => value > 0)
            .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
          )

          setUnipool(prev => ({
            ...prev,
            _portfolio,
          }));
        } catch (err) {
          console.error("Failed to fetch pool portfolio:", err);
        }
      }, []);
    
      useEffect(() => {
        fetchPortfolio();
        const interval = setInterval(fetchPortfolio, 60000);
        return () => clearInterval(interval);
      }, [fetchPortfolio, totalPortfolioValue]);


 
  const renderCustomizedLabel = ({
    cx, cy, midAngle, innerRadius, outerRadius, percent,
  }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-(midAngle ?? 0) * RADIAN);
    const y = cy + radius * Math.sin(-(midAngle ?? 0) * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
        {`${((percent ?? 1) * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-6 flex flex-col">
      <div className="flex items-center space-x-3 mb-4">
        <FileText className="text-purple-400" size={24} />
        <h3 className="text-xl font-bold text-white">Unipool Smart Contract Allocation</h3>
      </div>
      <div className="flex-grow grid grid-cols-1 md:grid-cols-1 gap-6">
        <div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={portfolioData}
                labelLine={false}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                fill="#8884d8"
                label={renderCustomizedLabel}
              >
                {portfolioData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div> 
      </div>
    </div>
  );
};



const DashboardApp: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const socket: Socket = io(MCP_SERVER_URL);

  const [researchAgent, setResearchAgent] = useState<AgentState>({ status: 'Awaiting data...', logs: [] });
  const [riskAgent, setRiskAgent] = useState<AgentState>({ status: 'Awaiting data...', logs: [] });
  const [pmAgent, setPmAgent] = useState<AgentState>({ status: 'Awaiting data...', logs: [] });
  const [traderAgent, setTraderAgent] = useState<AgentState>({ status: 'Awaiting instructions...', logs: [] });


  const truncateEthAddress = (
    address: string,
    prefixLength: number = 6, // Number of characters to show at the beginning (including "0x")
    suffixLength: number = 4  // Number of characters to show at the end
  ): string => {
    if (!address || address.length < prefixLength + suffixLength + 3) { // +3 for "..."
      return address; // Return original if too short to truncate effectively
    }
    const prefix = address.substring(0, prefixLength);
    const suffix = address.substring(address.length - suffixLength);
  
    return `${prefix}...${suffix}`;
  };

  const addLog = useCallback((setter: React.Dispatch<React.SetStateAction<AgentState>>, message: string) => {
    setter(prev => ({
      ...prev,
      logs: [{ timestamp: new Date().toLocaleTimeString(), message }, ...prev.logs].slice(0, 50),
    }));
  }, []);

  const updateStatus = useCallback((setter: React.Dispatch<React.SetStateAction<AgentState>>, status: string) => {
    setter(prev => ({ ...prev, status }));
  }, []);



  useEffect(() => {
    socket.on('connect', () => {
      console.log('### Connected to server');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('### Disconnected from server');
      setIsConnected(false);
    });

    socket.on('market_data', ({ message }: { message: any }) => {
      console.log('market_data', message);
      const status = `Analyzed ${message.token}: Score ${message.score}, Sentiment: ${message.sentiment}, Confidence: ${message.confidence}, Recommendation:  ${message.recommendation}, Factors:  ${message.key_factors}  `;
      updateStatus(setResearchAgent, status);
      addLog(setResearchAgent, status);
    });

    socket.on('risk_metrics', ({ message }: { message: any }) => {
      console.log('risk_metrics', message);
      const status = ` Token: ${message.symbol},  Risk Score: ${message.RiskScore}, std_risk: ${message.std_risk}`;
      updateStatus(setRiskAgent, status);
      addLog(setRiskAgent, status);
    });

    socket.on('risk_alert', ({ message }: { message: any }) => {
      console.log('risk_alert', message);
      const status = `Risk Assessment: ${message.type} (severity: ${message.severity}) -  ${message.message}`;
      updateStatus(setRiskAgent, status);
      addLog(setRiskAgent, status);
    });

    socket.on('pm_instructions', ({ message }: { message: any }) => {
      console.log('pm_instructions', message);
      const status = `New Trade Order  :: Action -> (${message.action}),   ${ message.detail ?  "Detail: Sell assets " + message.detail.sell_assets.map((address: string) => truncateEthAddress(address)) + " :: Buy assets " + message.detail.buy_assets.map((address: string) => truncateEthAddress(address)) : "" } `;
      updateStatus(setPmAgent, status);
      addLog(setPmAgent, status);
    });

    socket.on('trader_status', ({ message }: { message: any }) => {
      console.log('trader_status', message);
      const status = `${message.status}:  ${message.tx_hash ? " tx_hash : " + message.tx_hash + ", " : "" }  Sell assets ${message.details.sell_assets.map((address: string) => truncateEthAddress(address))}, Buy Assets -> ${message.details.buy_assets.map((address: string) => truncateEthAddress(address))} `;
      updateStatus(setTraderAgent, status);
      addLog(setTraderAgent, status);
      fetchPortfolio();
    });
    return () => {
      // socket.disconnect();
    };
    // eslint-disable-next-line
  }, []);




  return (
    <div className="bg-gray-900 min-h-screen text-white p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex justify-between items-center">
            
            <div className={`flex items-center space-x-2 p-2 rounded-lg ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {isConnected ? <Wifi size={20} /> : <WifiOff size={20} />}
              <span className="font-semibold">{isConnected ? 'AI Agents are running' : 'AI Agenst aren`t running'}</span>
            </div>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-8">
            <AgentCard name="Research-Agent" icon={<Activity className="text-green-400" />} status={researchAgent.status} logs={researchAgent.logs} />
            <AgentCard name="Trader-Agent" icon={<ArrowDown className="text-blue-400" />} status={traderAgent.status} logs={traderAgent.logs} />
          </div>
          <div className="space-y-8">
          <AgentCard name="Risk-Agent" icon={<Shield className="text-red-400" />} status={riskAgent.status} logs={riskAgent.logs} />
          <AgentCard name="PM-Agent" icon={<DollarSign className="text-yellow-400" />} status={pmAgent.status} logs={pmAgent.logs} />
          </div>
        </main>
      </div>
    </div>
  );
};

export { DashboardApp, UnipoolContractUI }

