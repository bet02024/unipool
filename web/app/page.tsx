"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useUnipool } from "@/hooks/useUnipool"
import { TrendingUp, TrendingDown, DollarSign, PieChart, RefreshCw, AlertCircle, Network } from "lucide-react"
import { toast } from "sonner"
import { ConnectKitButton } from "connectkit"
import { useAccount, useChainId, useSwitchChain } from "wagmi"
import { mainnet } from "wagmi/chains"
import { SUPPORTED_CHAINS } from "@/config/contracts"

export default function UnipoolDApp() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const {
    portfolioData,
    loading,
    usdcBalance,
    usdcAllowance,
    approveUsdc,
    invest,
    withdraw,
    refetch,
    isChainSupported,
    isPending,
    isConfirming,
    error,
  } = useUnipool()

  const [investAmount, setInvestAmount] = useState("")
  const [withdrawPercentage, setWithdrawPercentage] = useState([25])

  const handleInvest = async () => {
    if (!investAmount || Number.parseFloat(investAmount) <= 0) {
      toast.error("Please enter a valid amount")
      return
    }

    try {
      // Check if approval is needed
      if (Number.parseFloat(usdcAllowance) < Number.parseFloat(investAmount)) {
        toast.info("Approving USDC...")
        await approveUsdc(investAmount)
        toast.success("USDC approved successfully")
        return // Wait for approval to complete before investing
      }

      toast.info("Processing investment...")
      await invest(investAmount)
      setInvestAmount("")
    } catch (error: any) {
      toast.error(error?.message || "Transaction failed")
    }
  }

  const handleWithdraw = async () => {
    try {
      toast.info("Processing withdrawal...")
      await withdraw(withdrawPercentage[0])
    } catch (error: any) {
      toast.error(error?.message || "Transaction failed")
    }
  }

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const formatNumber = (num: string, decimals = 2) => {
    return Number.parseFloat(num).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  }

  const isTransacting = isPending || isConfirming

  // Show transaction status
  if (error) {
    toast.error(error.message)
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-900 border-gray-800">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-white">Unipool DApp</CardTitle>
            <CardDescription className="text-gray-400">Connect your wallet to start investing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ConnectKitButton.Custom>
              {({ isConnected, show, truncatedAddress, ensName }) => {
                return (
                  <Button onClick={show} className="w-full bg-white text-black hover:bg-gray-200">
                    {isConnected ? (ensName ?? truncatedAddress) : "Connect Wallet"}
                  </Button>
                )
              }}
            </ConnectKitButton.Custom>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!isChainSupported) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-900 border-gray-800">
          <CardHeader className="text-center">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <CardTitle className="text-xl font-bold text-white">Unsupported Network</CardTitle>
            <CardDescription className="text-gray-400">
              Please switch to a supported network to continue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-gray-400 text-center">
              Supported networks:{" "}
              {Object.values(SUPPORTED_CHAINS)
                .map((chain) => chain.name)
                .join(", ")}
            </div>
            <Button
              onClick={() => switchChain({ chainId: mainnet.id })}
              className="w-full bg-yellow-500 text-black hover:bg-yellow-600"
            >
              <Network className="w-4 h-4 mr-2" />
              Switch to Ethereum
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Unipool DApp</h1>
            <p className="text-gray-400">Decentralized Investment Protocol</p>
          </div>
          <div className="flex items-center gap-4">
            <Button
              onClick={refetch}
              variant="outline"
              size="sm"
              disabled={loading}
              className="border-gray-700 text-white hover:bg-gray-800 bg-transparent"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Badge variant="outline" className="border-gray-700 text-white">
              {formatAddress(address!)} • {SUPPORTED_CHAINS[chainId as keyof typeof SUPPORTED_CHAINS]?.name}
            </Badge>
            <ConnectKitButton.Custom>
              {({ isConnected, show, truncatedAddress, ensName }) => {
                return (
                  <Button
                    onClick={show}
                    variant="outline"
                    size="sm"
                    className="border-gray-700 text-white hover:bg-gray-800 bg-transparent"
                  >
                    {isConnected ? (ensName ?? truncatedAddress) : "Connect"}
                  </Button>
                )
              }}
            </ConnectKitButton.Custom>
          </div>
        </div>

        {/* Transaction Status */}
        {isTransacting && (
          <Card className="bg-blue-900/20 border-blue-800">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <div>
                  <p className="text-blue-400 font-medium">
                    {isPending ? "Confirm transaction in your wallet..." : "Transaction confirming..."}
                  </p>
                  <p className="text-blue-300 text-sm">Please wait while your transaction is processed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Portfolio Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Your Shares</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {portfolioData ? formatNumber(portfolioData.userShares, 4) : "0.0000"}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Share Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                ${portfolioData ? formatNumber(portfolioData.userShareValue) : "0.00"}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Invested Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                ${portfolioData ? formatNumber(portfolioData.userInvestedAmount) : "0.00"}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">P&L</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold flex items-center ${
                  portfolioData && Number.parseFloat(portfolioData.pnl) >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {portfolioData && Number.parseFloat(portfolioData.pnl) >= 0 ? (
                  <TrendingUp className="w-5 h-5 mr-2" />
                ) : (
                  <TrendingDown className="w-5 h-5 mr-2" />
                )}
                ${portfolioData ? formatNumber(portfolioData.pnl) : "0.00"}
              </div>
              <div
                className={`text-sm ${
                  portfolioData && Number.parseFloat(portfolioData.pnl) >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {portfolioData ? portfolioData.pnlPercentage : "0.00"}%
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Investment Section */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <DollarSign className="w-5 h-5 mr-2" />
                Investment
              </CardTitle>
              <CardDescription className="text-gray-400">Invest USDC into the Unipool protocol</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invest-amount" className="text-white">
                  Amount (USDC)
                </Label>
                <Input
                  id="invest-amount"
                  type="number"
                  placeholder="0.00"
                  value={investAmount}
                  onChange={(e) => setInvestAmount(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white"
                />
                <div className="text-sm text-gray-400">Balance: {formatNumber(usdcBalance)} USDC</div>
              </div>

              <Button
                onClick={handleInvest}
                disabled={isTransacting || !investAmount || Number.parseFloat(investAmount) <= 0}
                className="w-full bg-white text-black hover:bg-gray-200"
              >
                {isTransacting ? "Processing..." : "Invest"}
              </Button>

              <Separator className="bg-gray-700" />

              <div className="space-y-4">
                <Label className="text-white">Withdraw ({withdrawPercentage[0]}%)</Label>
                <Slider
                  value={withdrawPercentage}
                  onValueChange={setWithdrawPercentage}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-400">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>

                <Button
                  onClick={handleWithdraw}
                  disabled={isTransacting || !portfolioData || Number.parseFloat(portfolioData.userShares) <= 0}
                  variant="outline"
                  className="w-full border-gray-700 text-white hover:bg-gray-800 bg-transparent"
                >
                  {isTransacting ? "Processing..." : `Withdraw ${withdrawPercentage[0]}%`}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Protocol Analytics */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <PieChart className="w-5 h-5 mr-2" />
                Protocol Analytics
              </CardTitle>
              <CardDescription className="text-gray-400">Overview of the entire protocol</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Portfolio Value</span>
                  <span className="text-white font-medium">
                    ${portfolioData ? formatNumber(portfolioData.totalPortfolioValue) : "0.00"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Shares</span>
                  <span className="text-white font-medium">
                    {portfolioData ? formatNumber(portfolioData.totalShares, 4) : "0.0000"}
                  </span>
                </div>
              </div>

              <Separator className="bg-gray-700" />

              <div className="space-y-3">
                <h4 className="text-white font-medium">Portfolio Assets</h4>
                {portfolioData?.assetBalances.length ? (
                  portfolioData.assetBalances.map((asset, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-gray-400">{formatAddress(asset.address)}</span>
                      <span className="text-white">{formatNumber(asset.balance, 6)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500 text-sm">No assets found</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
