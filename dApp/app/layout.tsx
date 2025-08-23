import type React from "react"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "sonner"
import { Providers } from "@/components/providers"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "Unipool DApp",
  description: "Decentralized Investment Protocol",
    generator: ''
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <Toaster theme="dark" />
      </body>
    </html>
  )
}
