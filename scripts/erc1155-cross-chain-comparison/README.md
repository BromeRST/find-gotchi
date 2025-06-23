# ERC1155 Cross-Chain Comparison

This script compares ERC1155 token owners and balances across different blockchain networks using the [Alchemy NFT API](https://www.alchemy.com/docs/data/nft-api/api-reference/nft-ownership-endpoints/get-owners-for-contract-v-3). It identifies discrepancies in ownership data between chains, analyzes transfer activity to understand causes, and provides comprehensive analysis reports.

## Features

### Core Functionality

- **ERC1155 Focus**: Specifically designed for ERC1155 tokens with individual token ID balance tracking
- **Multi-chain Support**: Compare ownership across Polygon, Base Sepolia, and other Alchemy-supported networks
- **Historical Snapshots**: Query ownership data at specific block heights for time-based analysis
- **Token-level Analysis**: Compare both total balances and individual token ID balances for each owner

### Advanced Analysis

- **Transfer Activity Analysis**: Analyzes post-snapshot transfers to understand discrepancy causes
- **Balance Adjustment**: Applies transfer data to adjust Polygon balances and test if timing explains discrepancies
- **Effectiveness Measurement**: Calculates resolution rates to determine if transfers explain differences
- **Contract Address Filtering**: Automatically excludes known contract addresses from ownership comparisons

### Reporting & Output

- **Comprehensive Console Output**: Detailed real-time analysis with color-coded results
- **JSON Export**: Complete results saved to timestamped JSON files for further analysis
- **Discrepancy Detection**: Identifies owners with inconsistent balances and chain-exclusive ownership
- **Transfer Summaries**: Detailed transfer activity reports with block numbers and directions

### Technical Features

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

The script uses hardcoded configuration in the `getCollectionConfig()` function. Current default setup:

```typescript
chains: [
  {
    name: 'Polygon',
    alchemyEndpoint: 'https://polygon-mainnet.g.alchemy.com/nft/v3',
    contractAddress: '0x19f870bd94a34b3adaa9caa439d333da18d6812a',
    blockNumber: '72386800', // Specific snapshot block
    maxRequests: 100,
    requestDelay: 200,
    enabled: true,
  },
  {
    name: 'BaseSepolia',
    alchemyEndpoint: 'https://base-sepolia.g.alchemy.com/nft/v3',
    contractAddress: '0x5Aefdc5283B24EEa7b50FFBBf7FB8A2bD4537609',
    blockNumber: 'latest',
    maxRequests: 100,
    requestDelay: 200,
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

The script performs a comprehensive 6-step analysis:

### 1. Data Fetching

- Fetches all owners for each configured chain
- Handles pagination automatically for large datasets
- Filters out known contract addresses
- Respects rate limits with configurable delays

### 2. Ownership Comparison

- Compares owners across all chains
- Identifies chain-exclusive owners
- Detects balance discrepancies at token level
- Calculates summary statistics

### 3. Transfer Analysis

- Analyzes transfer activity after snapshot block
- Fetches transfers for addresses with discrepancies
- Filters for relevant token IDs only
- Provides detailed transfer logs with block numbers

### 4. Balance Adjustment

- Applies post-snapshot transfers to Polygon balances
- Adjusts balances based on RECEIVED/SENT transfers
- Tracks which addresses had activity

### 5. Effectiveness Analysis

- Compares original vs adjusted discrepancies
- Calculates resolution rate
- Determines if timing explains differences

### 6. Comprehensive Reporting

- Console output with detailed analysis
- JSON export for further processing
- Summary statistics and effectiveness metrics

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

📊 BALANCE DISCREPANCIES:

1. 0x6d8E193888C0a78f4F0be41d83C3bb486adca4f4
  Polygon: 22 total tokens (4 different token IDs)
  BaseSepolia: 16 total tokens (4 different token IDs)
  Tokens with differences (4 total):
    Token 65: Polygon: 2, BaseSepolia: 3
    Token 83: Polygon: 10, BaseSepolia: 4
    Token 101: Polygon: 5, BaseSepolia: 3
    Token 119: Polygon: 5, BaseSepolia: 6
```

### Transfer Analysis Output

```
🔍 ANALYZING TRANSFER ACTIVITY FOR DISCREPANCIES
📦 Collection: Installations
🏗️ Contract: 0x19f870bd94a34b3adaa9caa439d333da18d6812a
📊 Block reference: 72386800
🔢 Addresses to analyze: 18

[1/18] Checking transfers for 0x6d8E193888C0a78f4F0be41d83C3bb486adca4f4...
  ✓ Found 30 relevant transfers out of 303 total for this address
    RECEIVED in block 72643647: Token 101 from 0x0000000000000000000000000000000000000000
    SENT in block 72643683: Token 101 to 0x1d0360bac7299c86ec8e99d0c1c9a95fefaf2a11
```

### Balance Adjustment Output

```
🔧 ADJUSTING POLYGON BALANCES WITH TRANSFER DATA
📝 Adjusting balances for 0x6d8E193888C0a78f4F0be41d83C3bb486adca4f4:
  Token 101: 5 → 7 (+2)
📝 Adjusting balances for 0xfFea5a2cfAF1AaFbB87A1FE4eED5413DA45C30a0:
  Token 101: 1 → 0 (-5)
  Token 65: 9 → 17 (+8)

📊 ADJUSTMENT EFFECTIVENESS ANALYSIS
Original discrepancies: 18
Adjusted discrepancies: 18
Discrepancies resolved: 0
Resolution rate: 0.0%
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
    "tokenDiscrepancies": 79
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
  ]
}
```

## API Reference

### Modular Architecture

The script is organized into focused modules for maintainability:

#### **lib/fetchers.ts** - Data Fetching

- `fetchOwnersForContract()` - Fetches owners for a specific contract with pagination
- `fetchAllChainData()` - Orchestrates data fetching across multiple chains
- `fetchTransfersForContract()` - Fetches transfer data for analysis

#### **lib/comparison.ts** - Analysis Logic

- `compareOwnershipData()` - Core comparison algorithm between chains
- `compareAdjustedBalances()` - Compares adjusted balances after transfer analysis

#### **lib/printers.ts** - Output Formatting

- `printResults()` - Formats and displays main comparison results
- `printTransferAnalysis()` - Formats transfer analysis output

#### **lib/utils.ts** - Configuration & Utilities

- `getCollectionConfig()` - Manages configuration for single/multi-collection runs
- `analyzeTransfersForDiscrepancies()` - Analyzes post-snapshot transfer activity
- `adjustBalancesWithTransfers()` - Applies transfers to adjust balances
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
  alchemyEndpoint: string;
  contractAddress: string;
  blockNumber?: string;
  maxRequests: number;
  requestDelay: number;
  enabled: boolean;
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

interface TransferAnalysis {
  address: string;
  transfersFound: number;
  relevantTransfers: NftTransfer[];
  blockRange: { from: string; to: string };
}

interface ComparisonResult {
  collectionName: string;
  timestamp: string;
  summary: {
    totalOwners: { [chainName: string]: number };
    uniqueOwners: number;
    ownersWithDiscrepancies: number;
    tokenDiscrepancies: number;
  };
  discrepancies: OwnerComparison[];
  adjustedComparison?: ComparisonResult;
}
```

## Contract Address Filtering

The script automatically filters out known contract addresses to avoid false positives:

```typescript
const CONTRACT_ADDRESSES = new Set([
  '0x1d0360bac7299c86ec8e99d0c1c9a95fefaf2a11', // Realm Diamond
  '0x19f870bd94a34b3adaa9caa439d333da18d6812a', // Installations Diamond
  '0x9216c31d8146bcb3ea5a9162dc1702e8aedca355', // Tiles Diamond
  // ... more contract addresses
]);
```

## Troubleshooting

### Common Issues

1. **API Rate Limits**: Increase `requestDelay` in chain configuration
2. **Large Datasets**: Script handles pagination automatically
3. **Network Errors**: Built-in retry logic with graceful degradation
4. **Missing API Keys**: Check `.env` file configuration
5. **Hex Display Issues**: Fixed - totals now display in decimal format

### Error Messages

- `"ALCHEMY_API_KEY is required"`: Add API key to `.env` file
- `"HTTP 401: Unauthorized"`: Verify API key is correct
- `"HTTP 429: Too Many Requests"`: Increase request delays
- `"No enabled chains found"`: Check chain configuration

### Performance Considerations

- **Large contracts**: May take several minutes for 5000+ owners
- **Transfer analysis**: Limited to 50 addresses to avoid rate limits
- **Memory usage**: Processes data in memory - monitor for very large datasets
- **Rate limiting**: 200ms delays between requests by default

## Supported Networks

The script supports all Alchemy-compatible networks:

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
├── compareOwnersAcrossChains.ts    # Main orchestration script (122 lines)
├── runAllCollections.ts           # Multi-collection orchestrator
├── types.ts                       # TypeScript type definitions
├── chainAddresses.ts             # Contract address configurations
├── config.example.env            # Environment variable template
├── lib/                           # Modular library functions
│   ├── utils.ts                   # Configuration & utilities (377 lines)
│   ├── printers.ts               # Output formatting (220 lines)
│   ├── comparison.ts             # Comparison logic (217 lines)
│   └── fetchers.ts               # Data fetching (240 lines)
└── README.md                     # This documentation
```

## Recent Improvements

### v2.0 Features

- ✅ **Transfer Analysis**: Post-snapshot transfer activity analysis
- ✅ **Balance Adjustment**: Automatic balance adjustment based on transfers
- ✅ **Effectiveness Measurement**: Resolution rate calculation
- ✅ **Contract Filtering**: Automatic exclusion of contract addresses
- ✅ **Type Safety**: Complete TypeScript type system
- ✅ **Hex Fix**: Proper decimal display for token totals
- ✅ **Modular Architecture**: Refactored into clean, maintainable modules

### v2.1 Architecture Improvements

- 🏗️ **Modular Design**: Split 1150+ line script into focused modules
- 📦 **Separation of Concerns**: Each module handles specific functionality
- 🔧 **lib/utils.ts**: Configuration management and utility functions
- 🖨️ **lib/printers.ts**: All output formatting and display logic
- ⚖️ **lib/comparison.ts**: Core comparison algorithms
- 📡 **lib/fetchers.ts**: Data fetching and API interactions
- 🧪 **Testability**: Individual modules can be tested in isolation
- 🔄 **Reusability**: Functions can be imported by other scripts

### Performance Optimizations

- Pagination handling for large datasets
- Rate limiting with configurable delays
- Memory-efficient processing
- Graceful error handling and recovery

## Contributing

To extend functionality:

1. **Add new chains**: Update `ChainConfig` in `getCollectionConfig()`
2. **Add new collections**: Update `COLLECTIONS` array in `runAllCollections.ts`
3. **Modify analysis**: Extend transfer analysis or add new metrics
4. **Update types**: Add new interfaces in `types.ts`

## License

This project is part of the Aavegotchi ecosystem tools.
