export const config = {
  contractAddress: "0xYourContractAddressHere",
  chainId: 1,
  networkName: "mainnet",
  wagmiConfig: {
    connectors: [], // You can configure connectors with wagmi/connectors
    publicClient: undefined, // Define with createPublicClient
    webSocketPublicClient: undefined,
  },
};


export default config;
