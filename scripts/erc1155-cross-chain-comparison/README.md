# ERC1155 Cross-Chain Comparison

This script compares ERC1155 token owners and balances across different blockchain networks using the [Alchemy SDK v2](https://github.com/alchemyplatform/alchemy-sdk-js). It fetches ownership data directly at specific block heights and identifies discrepancies between chains, providing comprehensive analysis reports.

## Features

### Core Functionality

- **ERC1155 Focus**: Specifically designed for ERC1155 tokens with individual token ID balance tracking
- **Multi-chain Support**: Compare ownership across Polygon, Base Sepolia, and other Alchemy-supported networks
- **Direct Block Queries**: Query ownership data directly at specific block heights using Alchemy SDK v2
- **Token-level Analysis**: Compare both total balances and individual token ID balances for each owner

### Analysis Features

- **Historical Snapshots**: Query ownership data at specific block heights for time-based analysis
- **Contract Address Filtering**: Automatically excludes known contract addresses from ownership comparisons
- **Discrepancy Detection**: Identifies owners with inconsistent balances and chain-exclusive ownership
- **Simplified Comparison**: Direct block-based comparison without complex transfer analysis

### Reporting & Output

- **Comprehensive Console Output**: Detailed real-time analysis with color-coded results
- **JSON Export**: Complete results saved to timestamped JSON files for further analysis
- **Summary Statistics**: Clear overview of ownership differences between chains

### Technical Features

- **Alchemy SDK v2**: Uses alchemy-sdk v2 for direct block parameter support
- **Pagination Handling**: Automatically handles large datasets with proper pagination
- **Rate Limiting**: Built-in delays to respect API rate limits
- **Error Handling**: Graceful handling of API errors and network issues
- **Type Safety**: Full TypeScript implementation with comprehensive type definitions

## Prerequisites

1. **Alchemy API Key**: Single API key that works across all chains
2. **Node.js & TypeScript**: Runtime environment for the script
3. **Environment Variables**: API key configuration

## Setup

### 1. Environment Variables

Create a `.env` file in the project root:

```env
# Single Alchemy API Key (works across all chains)
ALCHEMY_API_KEY=your_alchemy_api_key_here
```

### 2. Get Alchemy API Key

1. Visit [Alchemy](https://www.alchemy.com/)
2. Create an account and get an API key that supports multiple networks
3. Add the API key to your `.env` file

### 3. Install Dependencies

```bash
yarn install
```

## Usage

### Single Collection Comparison

```bash
# Run ERC1155 cross-chain comparison
yarn compare-erc1155-cross-chain

# Or run directly
npx ts-node scripts/erc1155-cross-chain-comparison/compareOwnersAcrossChains.ts
```

### Multi-Collection Comparison

```bash
# Run all configured collections
yarn compare-all-erc1155-collections

# Or run directly
npx ts-node scripts/erc1155-cross-chain-comparison/runAllCollections.ts
```

## Configuration

The script uses configuration in the `getCollectionConfig()` function. Current default setup:

```typescript
chains: [
  {
    name: 'Polygon',
    contractAddress: '0x19f870bd94a34b3adaa9caa439d333da18d6812a',
    blockNumber: '72386800', // Specific snapshot block
    maxRequests: 100,
    requestDelay: 100,
    enabled: true,
  },
  {
    name: 'BaseSepolia',
    contractAddress: '0x5Aefdc5283B24EEa7b50FFBBf7FB8A2bD4537609',
    blockNumber: 'latest', // Latest block
    maxRequests: 100,
    requestDelay: 100,
    enabled: true,
  },
],
collectionName: 'Installations'
```

### Block Parameter Options

The `blockNumber` field supports:

- **Decimal numbers**: `"72386800"`
- **Hex numbers**: `"0x45088f0"`
- **Block tags**: `"latest"`, `"earliest"`, `"finalized"`
- **Omit for latest**: If not specified, uses latest block

## Analysis Process

The script performs a comprehensive 3-step analysis:

### 1. Data Fetching

- Fetches all owners for each configured chain using Alchemy SDK v2
- Queries data directly at specified block heights using `blockTag` parameter
- Handles pagination automatically for large datasets
- Filters out known contract addresses
- Respects rate limits with configurable delays

### 2. Ownership Comparison

- Compares owners across all chains
- Identifies chain-exclusive owners
- Detects balance discrepancies at token level
- Calculates summary statistics

### 3. Comprehensive Reporting

- Console output with detailed analysis
- JSON export for further processing
- Summary statistics and discrepancy details

## Output Examples

### Console Output

```
🔍 ERC1155 CROSS-CHAIN COMPARISON RESULTS
📦 Collection: Installations
🕒 Analysis completed at: 6/23/2025, 1:00:25 PM
================================================================================

📊 SUMMARY:
Collection: Installations
Chains compared: Polygon, BaseSepolia
Unique owners across all chains: 5864
Owners on Polygon: 5862
Owners on BaseSepolia: 5852
Owners with discrepancies: 18
Total token discrepancies: 79

🏷️ CHAIN-EXCLUSIVE OWNERS:
Only on Polygon: 12 owners
Only on BaseSepolia: 2 owners

⚠️ DISCREPANCIES FOUND:

Chain-exclusive owners: 14
Balance discrepancy owners: 4

📊 BALANCE DISCREPANCIES:

1. 0x6d8E193888C0a78f4F0be41d83C3bb486adca4f4
  Polygon: 22 total tokens (4 different token IDs)
  BaseSepolia: 16 total tokens (4 different token IDs)
  Tokens with differences (4 total):
    Token 65:
      Polygon: 2
      BaseSepolia: 3
    Token 83:
      Polygon: 10
      BaseSepolia: 4
    Token 101:
      Polygon: 5
      BaseSepolia: 3
    Token 119:
      Polygon: 5
      BaseSepolia: 6
```

### JSON Export

Results are saved to `data/results/erc1155/[collection]-comparison-[timestamp].json`:

```json
{
  "collectionName": "Installations",
  "timestamp": "2025-06-23T11:00:25.149Z",
  "summary": {
    "totalOwners": {
      "Polygon": 5862,
      "BaseSepolia": 5852
    },
    "uniqueOwners": 5864,
    "ownersWithDiscrepancies": 18,
    "tokenDiscrepancies": 79,
    "chainsCompared": ["Polygon", "BaseSepolia"],
    "contractAddresses": {
      "Polygon": "0x19f870bd94a34b3adaa9caa439d333da18d6812a",
      "BaseSepolia": "0x5Aefdc5283B24EEa7b50FFBBf7FB8A2bD4537609"
    }
  },
  "discrepancies": [
    {
      "ownerAddress": "0x6d8E193888C0a78f4F0be41d83C3bb486adca4f4",
      "discrepancies": {
        "tokenBalanceDiffs": [
          {
            "tokenId": "65",
            "balances": {
              "Polygon": 2,
              "BaseSepolia": 3
            }
          }
        ]
      }
    }
  ],
  "detailedReport": {
    "ownersOnlyOnChain": {
      "Polygon": ["0x1234..."],
      "BaseSepolia": ["0x5678..."]
    }
  }
}
```

## API Reference

### Modular Architecture

The script is organized into focused modules for maintainability:

#### **lib/fetchers.ts** - Data Fetching

- `fetchOwnersForContract()` - Fetches owners for a specific contract with pagination using Alchemy SDK v2
- `fetchAllChainData()` - Orchestrates data fetching across multiple chains

#### **lib/comparison.ts** - Analysis Logic

- `compareOwnershipData()` - Core comparison algorithm between chains

#### **lib/printers.ts** - Output Formatting

- `printResults()` - Formats and displays main comparison results

#### **lib/utils.ts** - Configuration & Utilities

- `getCollectionConfig()` - Manages configuration for single/multi-collection runs
- `saveResults()` - JSON export functionality

### Types

All types are defined in `types.ts`:

```typescript
interface TokenBalance {
  tokenId: string;
  balance: number;
}

interface Owner {
  ownerAddress: string;
  tokenBalances: TokenBalance[];
}

interface ChainConfig {
  name: string;
  contractAddress: string;
  blockNumber?: string;
  maxRequests?: number;
  requestDelay?: number;
  enabled?: boolean;
}

interface OwnerComparison {
  ownerAddress: string;
  discrepancies: {
    tokenBalanceDiffs: Array<{
      tokenId: string;
      balances: { [chainName: string]: number };
    }>;
  };
}

interface ComparisonResult {
  collectionName: string;
  timestamp: string;
  summary: {
    totalOwners: { [chainName: string]: number };
    uniqueOwners: number;
    ownersWithDiscrepancies: number;
    tokenDiscrepancies: number;
    chainsCompared: string[];
    contractAddresses: { [chainName: string]: string };
  };
  discrepancies: OwnerComparison[];
  detailedReport: {
    ownersOnlyOnChain: { [chainName: string]: string[] };
  };
}
```

## Contract Address Filtering

The script automatically filters out known contract addresses to avoid false positives:

```typescript
const KNOWN_CONTRACT_ADDRESSES = new Set([
  // Polygon contract addresses
  polygonAddresses.realmDiamond.toLowerCase(),
  polygonAddresses.installationsDiamond.toLowerCase(),
  polygonAddresses.tilesDiamond.toLowerCase(),
  polygonAddresses.aavegotchiDiamond.toLowerCase(),
  polygonAddresses.wearableDiamond.toLowerCase(),

  // Base Sepolia contract addresses
  baseSepoliaAddresses.realmDiamond.toLowerCase(),
  baseSepoliaAddresses.installationsDiamond.toLowerCase(),
  baseSepoliaAddresses.tilesDiamond.toLowerCase(),
  baseSepoliaAddresses.aavegotchiDiamond.toLowerCase(),
  baseSepoliaAddresses.wearableDiamond.toLowerCase(),

  // Common addresses
  '0x000000000000000000000000000000000000dead', // burn address
  '0x0000000000000000000000000000000000000000', // zero address
]);
```

## Troubleshooting

### Common Issues

1. **API Rate Limits**: Increase `requestDelay` in chain configuration
2. **Large Datasets**: Script handles pagination automatically
3. **Network Errors**: Built-in retry logic with graceful degradation
4. **Missing API Keys**: Check `.env` file configuration

### Error Messages

- `"ALCHEMY_API_KEY is required"`: Add API key to `.env` file
- `"HTTP 401: Unauthorized"`: Verify API key is correct
- `"HTTP 429: Too Many Requests"`: Increase request delays
- `"Unsupported chain"`: Check chain name in configuration

### Performance Considerations

- **Large contracts**: May take several minutes for 5000+ owners
- **Memory usage**: Processes data in memory - monitor for very large datasets
- **Rate limiting**: 100ms delays between requests by default
- **Block queries**: Direct block queries are faster than transfer analysis

## Supported Networks

The script supports all Alchemy SDK v2 compatible networks:

- **Polygon Mainnet** ✅ (Primary)
- **Base Sepolia** ✅ (Primary)
- **Ethereum Mainnet**
- **Arbitrum**
- **Optimism**
- **Base Mainnet**
- **And more...**

See [Alchemy's documentation](https://docs.alchemy.com/reference/nft-api-quickstart#supported-networks) for the complete list.

## File Structure

```
scripts/erc1155-cross-chain-comparison/
├── compareOwnersAcrossChains.ts    # Main orchestration script
├── runAllCollections.ts           # Multi-collection orchestrator
├── config.example.env            # Environment variable template
├── lib/                           # Modular library functions
│   ├── types.ts                   # TypeScript type definitions
│   ├── chainAddresses.ts         # Contract address configurations
│   ├── utils.ts                   # Configuration & utilities
│   ├── printers.ts               # Output formatting
│   ├── comparison.ts             # Comparison logic
│   └── fetchers.ts               # Data fetching with Alchemy SDK v2
└── README.md                     # This documentation
```

## Recent Improvements

### v3.0 Major Update - Alchemy SDK v2 Migration

- ✅ **SDK Migration**: Migrated from alchemy-sdk v3 to v2 for `blockTag` parameter support
- ✅ **Direct Block Queries**: Fetch ownership data directly at specific blocks using `blockTag`
- ✅ **Simplified Architecture**: Removed complex transfer analysis in favor of direct queries
- ✅ **Performance Improvement**: Faster execution without transfer fetching overhead
- ✅ **Reduced Complexity**: Cleaner codebase with focused functionality
- ✅ **Better Reliability**: Fewer API calls and dependencies

### Key Changes from v2.x

- 🔄 **Removed Transfer Analysis**: No longer fetches and analyzes post-snapshot transfers
- 🔄 **Removed Balance Adjustment**: Direct block queries eliminate need for adjustments
- 🔄 **Simplified Output**: Focus on ownership comparison without transfer details
- 🎯 **Block-First Approach**: Query data at desired state directly rather than adjusting afterward

### Performance Optimizations

- Faster execution with direct block queries
- Reduced API calls (no transfer fetching)
- Simplified processing pipeline
- Memory-efficient single-pass comparison

### Architecture Benefits

- 🏗️ **Modular Design**: Focused modules for specific functionality
- 📦 **Separation of Concerns**: Clear responsibility boundaries
- 🧪 **Testability**: Individual modules can be tested in isolation
- 🔄 **Reusability**: Functions can be imported by other scripts
- 🚀 **Maintainability**: Easier to understand and modify

## Contributing

To extend functionality:

1. **Add new chains**: Update `ChainConfig` in `getCollectionConfig()`
2. **Add new collections**: Update `COLLECTIONS` array in `runAllCollections.ts`
3. **Modify analysis**: Extend comparison logic or add new metrics
4. **Update types**: Add new interfaces in `lib/types.ts`

## License

This project is part of the Aavegotchi ecosystem tools.
