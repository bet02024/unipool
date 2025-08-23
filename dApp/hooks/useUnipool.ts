"use client"

import { useState, useEffect, useCallback } from "react"
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useChainId } from "wagmi"
import { formatUnits, parseUnits } from "viem"
import { CONTRACTS, SUPPORTED_CHAINS } from "@/config/contracts"

interface PortfolioData {
  userShares: string
  userShareValue: string
  userInvestedAmount: string
  totalPortfolioValue: string
  totalShares: string
  assetBalances: { address: string; balance: string }[]
  pnl: string
  pnlPercentage: string
}

export function useUnipool() {

  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null)
  const [loading, setLoading] = useState(false)
  const [usdcBalance, setUsdcBalance] = useState("0")
  const [usdcAllowance, setUsdcAllowance] = useState("0")

  const { writeContract, data: hash, error, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })

  // Check if current chain is supported
  const isChainSupported = chainId && chainId in SUPPORTED_CHAINS
  const currentContracts = isChainSupported
    ? SUPPORTED_CHAINS[chainId as keyof typeof SUPPORTED_CHAINS].contracts
    : null

  // Read contract data with proper error handling
  const { data: userShares, refetch: refetchUserShares } = useReadContract({
    address: currentContracts?.UNIPOOL,
    abi: CONTRACTS.UNIPOOL.abi,
    functionName: "userShares",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!isChainSupported && !!currentContracts,
      retry: 3,
      retryDelay: 1000,
    },
  })

  const { data: userShareValue, refetch: refetchUserShareValue } = useReadContract({
    address: currentContracts?.UNIPOOL,
    abi: CONTRACTS.UNIPOOL.abi,
    functionName: "getUserShareValue",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!isChainSupported && !!currentContracts,
      retry: 3,
      retryDelay: 1000,
    },
  })

  const { data: userInvestedAmount, refetch: refetchUserInvestedAmount } = useReadContract({
    address: currentContracts?.UNIPOOL,
    abi: CONTRACTS.UNIPOOL.abi,
    functionName: "userInvestedAmount",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!isChainSupported && !!currentContracts,
      retry: 3,
      retryDelay: 1000,
    },
  })

  const { data: totalPortfolioValue, refetch: refetchTotalPortfolioValue } = useReadContract({
    address: currentContracts?.UNIPOOL,
    abi: CONTRACTS.UNIPOOL.abi,
    functionName: "getPortfolioValue",
    query: {
      enabled: !!isChainSupported && !!currentContracts,
      retry: 3,
      retryDelay: 1000,
    },
  })

  const { data: totalShares, refetch: refetchTotalShares } = useReadContract({
    address: currentContracts?.UNIPOOL,
    abi: CONTRACTS.UNIPOOL.abi,
    functionName: "totalShares",
    query: {
      enabled: !!isChainSupported && !!currentContracts,
      retry: 3,
      retryDelay: 1000,
    },
  })

  const { data: assetBalancesData, refetch: refetchAssetBalances } = useReadContract({
    address: currentContracts?.UNIPOOL,
    abi: CONTRACTS.UNIPOOL.abi,
    functionName: "assetBalances",
    query: {
      enabled: !!isChainSupported && !!currentContracts,
      retry: 3,
      retryDelay: 1000,
    },
  })

  const { data: usdcBalanceData, refetch: refetchUsdcBalance } = useReadContract({
    address: currentContracts?.USDC,
    abi: CONTRACTS.USDC.abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!isChainSupported && !!currentContracts,
      retry: 3,
      retryDelay: 1000,
    },
  })

  const { data: usdcAllowanceData, refetch: refetchUsdcAllowance } = useReadContract({
    address: currentContracts?.USDC,
    abi: CONTRACTS.USDC.abi,
    functionName: "allowance",
    args: address && currentContracts ? [address, currentContracts.UNIPOOL] : undefined,
    query: {
      enabled: !!address && !!isChainSupported && !!currentContracts,
      retry: 3,
      retryDelay: 1000,
    },
  })

  useEffect(() => {
    console.log("## useEffect [address, isConnected] ##",  address, isConnected)
    }, [address, isConnected])

  // Update portfolio data when contract reads complete
  useEffect(() => {
   /* if (
      userShares !== undefined &&
      userShareValue !== undefined &&
      userInvestedAmount !== undefined &&
      totalPortfolioValue !== undefined &&
      totalShares !== undefined &&
      assetBalancesData
    ) {*/
      try {

        console.log("## Update portfolio data ##",  address, isConnected, userShares, userShareValue, userInvestedAmount, 
          totalPortfolioValue, totalShares, assetBalancesData)


        const [assetAddresses, assetBalances] = assetBalancesData as [readonly `0x${string}`[], readonly bigint[]]

        const formattedAssetBalances = assetAddresses.map((addr, index) => ({
          address: addr,
          balance: formatUnits(assetBalances[index], 6),
        }))

        console.log("## formattedAssetBalances ##", formattedAssetBalances)

        const userShareValueFormatted = formatUnits(userShareValue, 6)
        const userInvestedAmountFormatted = formatUnits(userInvestedAmount, 6)

        const pnl = (
          Number.parseFloat(userShareValueFormatted) - Number.parseFloat(userInvestedAmountFormatted)
        ).toString()
        const pnlPercentage =
          Number.parseFloat(userInvestedAmountFormatted) > 0
            ? ((Number.parseFloat(pnl) / Number.parseFloat(userInvestedAmountFormatted)) * 100).toFixed(2)
            : "0"

        setPortfolioData({
          userShares:  formatUnits(userShares, 6),
          userShareValue: userShareValueFormatted,
          userInvestedAmount: userInvestedAmountFormatted,
          totalPortfolioValue: formatUnits(totalPortfolioValue, 6),
          totalShares:  formatUnits(totalShares, 6),
          assetBalances: formattedAssetBalances,
          pnl,
          pnlPercentage,
        })
      } catch (error) {
        console.error("Error processing portfolio data:", error)
      }
   // }
  }, [userShares, userShareValue, userInvestedAmount, totalPortfolioValue, totalShares, assetBalancesData, isConnected])

  // Update USDC data
  useEffect(() => {
    try {
      if (usdcBalanceData !== undefined) {
        setUsdcBalance(formatUnits(usdcBalanceData, 6))
      }
      if (usdcAllowanceData !== undefined) {
        setUsdcAllowance(formatUnits(usdcAllowanceData, 6))
      }
    } catch (error) {
      console.error("Error processing USDC data:", error)
    }
  }, [usdcBalanceData, usdcAllowanceData])

  const approveUsdc = useCallback(
    async (amount: string) => {
      if (!currentContracts) throw new Error("Unsupported chain")

      const amountWei = parseUnits(amount, 6)
      writeContract({
        address: currentContracts.USDC,
        abi: CONTRACTS.USDC.abi,
        functionName: "approve",
        args: [currentContracts.UNIPOOL, amountWei],
      })
    },
    [currentContracts, writeContract],
  )

  const invest = useCallback(
    async (amount: string) => {
      if (!currentContracts) throw new Error("Unsupported chain")

      const amountWei = parseUnits(amount, 6)
      writeContract({
        address: currentContracts.UNIPOOL,
        abi: CONTRACTS.UNIPOOL.abi,
        functionName: "invest",
        args: [amountWei],
      })
    },
    [currentContracts, writeContract],
  )

  const withdraw = useCallback(
    async (percentage: number) => {
      if (!currentContracts) throw new Error("Unsupported chain")

      const basisPoints = BigInt(Math.floor(percentage * 100))
      writeContract({
        address: currentContracts.UNIPOOL,
        abi: CONTRACTS.UNIPOOL.abi,
        functionName: "withdraw",
        args: [basisPoints],
      })
    },
    [currentContracts, writeContract],
  )

  const refetch = useCallback(( _address: any) => {
    console.log("###refetch()###", _address, chainId, isChainSupported, address, isConnected )
    Promise.all([
      refetchUserShares(),
      refetchUserShareValue(),
      refetchUserInvestedAmount(),
      refetchTotalPortfolioValue(),
      refetchTotalShares(),
      refetchAssetBalances(),
      refetchUsdcBalance(),
      refetchUsdcAllowance(),
    ]).catch(console.error)
  }, [
    refetchUserShares,
    refetchUserShareValue,
    refetchUserInvestedAmount,
    refetchTotalPortfolioValue,
    refetchTotalShares,
    refetchAssetBalances,
    refetchUsdcBalance,
    refetchUsdcAllowance,
  ])

  // Refetch data when transaction is confirmed
  useEffect(() => {
    if (isConfirmed) {
      refetch()
    }
  }, [isConfirmed, refetch])

  return {
    portfolioData,
    loading: loading || isConfirming,
    usdcBalance,
    usdcAllowance,
    approveUsdc,
    invest,
    withdraw,
    refetch,
    isChainSupported: !!isChainSupported,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  }
}
