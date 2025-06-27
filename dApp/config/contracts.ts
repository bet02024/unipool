//import { unichain } from "wagmi/chains"
import { type Chain } from 'viem'

export const unichain = {
  id: 130,
  name: 'Unichain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://unichain-mainnet.infura.io/v3/26R21SZqpvCe4I4tByOc41h4p8h', 'https://mainnet.unichain.org', 'https://unichain-rpc.publicnode.com' ] },
  },
  blockExplorers: {
    default: { name: 'Unichain Mainnet Explorer', url: 'https://unichain.blockscout.com' },
  }, 
} as const satisfies Chain


export const CONTRACTS = {
  UNIPOOL: {
    address: "0xc79AB5D4544E50Db86061cF34908Ea42ADc2EDda" as `0x${string}`, // Replace with actual contract address
    abi: [
      {
        type: "function",
        name: "assetBalances",
        inputs: [],
        outputs: [
          {
            name: "",
            type: "address[]",
            internalType: "address[]",
          },
          {
            name: "",
            type: "uint256[]",
            internalType: "uint256[]",
          },
        ],
        stateMutability: "view",
      },
      {
        type: "function",
        name: "getPortfolioValue",
        inputs: [],
        outputs: [
          {
            name: "",
            type: "uint256",
            internalType: "uint256",
          },
        ],
        stateMutability: "view",
      },
      {
        type: "function",
        name: "getUserShareValue",
        inputs: [
          {
            name: "user",
            type: "address",
            internalType: "address",
          },
        ],
        outputs: [
          {
            name: "",
            type: "uint256",
            internalType: "uint256",
          },
        ],
        stateMutability: "view",
      },
      {
        type: "function",
        name: "portfolioAssetsList",
        inputs: [],
        outputs: [
          {
            name: "",
            type: "address[]",
            internalType: "address[]",
          },
        ],
        stateMutability: "view",
      },
      {
        type: "function",
        name: "totalShares",
        inputs: [],
        outputs: [
          {
            name: "",
            type: "uint256",
            internalType: "uint256",
          },
        ],
        stateMutability: "view",
      },
      {
        type: "function",
        name: "userInvestedAmount",
        inputs: [
          {
            name: "",
            type: "address",
            internalType: "address",
          },
        ],
        outputs: [
          {
            name: "",
            type: "uint256",
            internalType: "uint256",
          },
        ],
        stateMutability: "view",
      },
      {
        type: "function",
        name: "userShares",
        inputs: [
          {
            name: "",
            type: "address",
            internalType: "address",
          },
        ],
        outputs: [
          {
            name: "",
            type: "uint256",
            internalType: "uint256",
          },
        ],
        stateMutability: "view",
      },
      {
        type: "function",
        name: "withdraw",
        inputs: [
          {
            name: "basisPoints",
            type: "uint256",
            internalType: "uint256",
          },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
      {
        type: "function",
        name: "invest",
        inputs: [
          {
            name: "amount",
            type: "uint256",
            internalType: "uint256",
          },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ] as const,
  },
  USDC: {
    address: "0x078D782b760474a361dDA0AF3839290b0EF57AD6" as `0x${string}`, // Replace with actual USDC address
    abi: [
      {
        type: "function",
        name: "approve",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
      },
      {
        type: "function",
        name: "balanceOf",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
      },
      {
        type: "function",
        name: "allowance",
        inputs: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
        ],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
      },
    ] as const,
  },
} as const

export const SUPPORTED_CHAINS = {
  [unichain.id]: {
    name: "Unichain Mainnet",
    contracts: {
      UNIPOOL: "0xc79AB5D4544E50Db86061cF34908Ea42ADc2EDda" as `0x${string}`,
      USDC: "0x078D782b760474a361dDA0AF3839290b0EF57AD6" as `0x${string}`,
    },
  },
}

export const NETWORK_CONFIG = {
  chainId: unichain.id,
  chainName: unichain.name,
  rpcUrl: 'https://unichain-mainnet.infura.io/v3/26R21SZqpvCe4I4tByOc41h4p8h',
  blockExplorerUrl: 'https://unichain.blockscout.com/',
}
