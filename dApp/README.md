# Unipool DApp

A modern decentralized investment protocol built with Next.js, ConnectKit, and Wagmi. This DApp allows users to invest USDC, withdraw funds, and track their portfolio performance across multiple blockchain networks.


## 🛠 Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Web3**: Wagmi v2, Viem, ConnectKit
- **Styling**: Tailwind CSS, shadcn/ui components
- **State Management**: TanStack Query (React Query)
- **Notifications**: Sonner toast notifications


## 🚀 Quick Start

### 1. Clone the Repository

### 2. Install Dependencies

yarn install

### 3. Environment Setup

Create a \`.env\` file in the root directory:

### 5. Run the Development Server

yarn dev
npm run dev


### Adding New Networks

To add support for additional networks, update \`config/wagmi.ts\` and \`config/contracts.ts\`:

\`\`\`typescript
// In config/wagmi.ts
import { polygon, arbitrum } from "wagmi/chains"

const chains = [mainnet, sepolia, polygon, arbitrum] as const

// In config/contracts.ts
export const SUPPORTED_CHAINS = {
  // ... existing chains
  [polygon.id]: {
    name: "Polygon",
    contracts: {
      UNIPOOL: "0xYourPolygonUnipoolAddress" as \`0x\${string}\`,
      USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as \`0x\${string}\`, // Polygon USDC
    },
  },
}
\`\`\`

### Build for Production

\`\`\`bash
npm run build
# or
yarn build
# or
pnpm build
\`\`\`

### Start Production Server

\`\`\`bash
npm start
# or
yarn start
# or
pnpm start
\`\`\`

## 🧪 Testing

### Run Tests

\`\`\`bash
npm test
# or
yarn test
# or
pnpm test
\`\`\`

### Run Linting

\`\`\`bash
npm run lint
# or
yarn lint
# or
pnpm lint
\`\`\`

