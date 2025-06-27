import { getDefaultConfig } from "connectkit"
import { createConfig } from "wagmi"

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


const chains = [unichain] as const
export const config = createConfig(
  getDefaultConfig({
    chains,
    transports: {
      [unichain.id]: `https://unichain-mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`,
    },
    // Required App Info
    appName: "Unipool DApp",
    appDescription: "Decentralized Investment Protocol",
    appUrl: "https://unipool-dapp.vercel.app", // your app's url
    appIcon: "https://unipool-dapp.vercel.app/logo.png", // your app's icon, no bigger than 1024x1024px (max. 1MB)
  }),
)

declare module "wagmi" {
  interface Register {
    config: typeof config
  }
}
