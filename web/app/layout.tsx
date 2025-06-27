"use client"

import type React from "react"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "sonner"
import { WagmiProvider } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ConnectKitProvider } from "connectkit"
import { config } from "@/config/wagmi"

const inter = Inter({ subsets: ["latin"] })

const queryClient = new QueryClient()

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
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
              <Toaster theme="dark" />
            </ConnectKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  )
}

/*export const metadata = {
  generator: 'v0.dev'
};*/
