import { getDefaultConfig } from "connectkit"
import { createConfig } from "wagmi"
import { http } from "viem"

export const unichain = {
  id: 130,
  name: "Unichain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://mainnet.unichain.org", "https://unichain-rpc.publicnode.com"],
    },
  },
  blockExplorers: {
    default: { name: "Unichain Mainnet Explorer", url: "https://unichain.blockscout.com" },
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 1,
    },
  },
} as const

const chains = [unichain] as const

export const config = createConfig(
  getDefaultConfig({
    chains,
    transports: {
      [unichain.id]: http(),
    },
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",
    appName: "Unipool DApp",
    appDescription: "Decentralized Investment Protocol",
    appUrl: "https://unipool-dapp.vercel.app",
    appIcon: "https://unipool-dapp.vercel.app/logo.png",
  }),
)

declare module "wagmi" {
  interface Register {
    config: typeof config
  }
}
