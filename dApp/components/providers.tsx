"use client"

import type React from "react"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider } from "wagmi"
import { ConnectKitProvider } from "connectkit"
import { config } from "@/config/wagmi"
import { useState } from "react"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      }),
  )

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="midnight"
          mode="dark"
          customTheme={{
            "--ck-connectbutton-font-size": "16px",
            "--ck-connectbutton-border-radius": "8px",
            "--ck-connectbutton-color": "#000000",
            "--ck-connectbutton-background": "#ffffff",
            "--ck-connectbutton-hover-background": "#f5f5f5",
          }}
        >
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
