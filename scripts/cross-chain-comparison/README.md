# Cross-Chain NFT Ownership Comparison

This script compares NFT owners and token balances across different blockchain networks using the [Alchemy NFT API](https://www.alchemy.com/docs/data/nft-api/api-reference/nft-ownership-endpoints/get-owners-for-contract-v-3). It identifies discrepancies in ownership data between chains and provides detailed analysis reports.

## Features

- **Multi-chain support**: Compare ownership across Ethereum, Polygon, Arbitrum, and other Alchemy-supported networks
- **Historical snapshots**: Query ownership data at specific block heights for time-based analysis
- **Token-level analysis**: Compare both total balances and individual token ID balances
- **Discrepancy detection**: Automatically identifies owners with inconsistent balances across chains
- **Comprehensive reporting**: Generates detailed console output and JSON reports
- **Pagination handling**: Automatically handles large datasets with pagination
- **Rate limiting**: Built-in delays to respect API rate limits
- **Error handling**: Graceful handling of API errors and network issues

## Prerequisites

1. **Alchemy API Key**: You need one Alchemy API key that works across all chains
2. **Collection Name**: A name for your NFT collection for reporting purposes
3. **Environment Variables**: Configure your API key and collection name

## Setup

### 1. Environment Variables

Create a `.env` file in the project root with your configuration:

```env
# Single Alchemy API Key (works across all chains)
ALCHEMY_API_KEY=your_alchemy_api_key_here

# Collection Name for reporting
COLLECTION_NAME=Your NFT Collection Name
```

### 2. Contract Addresses & Block Heights

Contract addresses are hardcoded in the script configuration. To modify them, edit the `COLLECTION_CONFIG.chains` array in `scripts/cross-chain-comparison/compareOwnersAcrossChains.ts`:

```typescript
chains: [
  {
    name: 'BaseSepolia',
    alchemyEndpoint: 'https://base-sepolia.g.alchemy.com/nft/v3',
    contractAddress: '0x86935f11c86623dec8a25696e1c19a8659cbf95d',
    blockNumber: '12345678', // Optional: specific block number (decimal or hex)
    // ... other config
  },
  {
    name: 'Polygon',
    alchemyEndpoint: 'https://polygon-mainnet.g.alchemy.com/nft/v3',
    contractAddress: '0x86935f11c86623dec8a25696e1c19a8659cbf95d',
    blockNumber: 'latest', // Optional: block tag (latest, earliest, finalized)
    // ... other config
  },
];
```

#### Block Parameter Options

The `blockNumber` field supports:

- **Decimal block numbers**: `"15753215"`
- **Hex block numbers**: `"0xf00f0f"`
- **Block tags**: `"latest"`, `"earliest"`, `"finalized"`
- **Omit for latest**: If not specified, uses the latest available block

### 2. Get Alchemy API Key

1. Visit [Alchemy](https://www.alchemy.com/)
2. Create an account and get a single API key that supports multiple networks
3. Add the API key to your `.env` file

### 3. Install Dependencies

```bash
yarn install
```

## Usage

### Run the Comparison

```bash
# Using npm script
yarn compare-owners-cross-chain

# Or directly with ts-node
npx ts-node scripts/compareOwnersAcrossChains.ts
```

### Configuration

The script is configured via the `COLLECTION_CONFIG` object in `scripts/cross-chain-comparison/compareOwnersAcrossChains.ts`. You can:

1. **Add more chains**: Add new chain configurations to support more networks
2. **Modify endpoints**: Change Alchemy endpoints for different networks
3. **Update contract addresses**: Set different contract addresses per chain via environment variables
4. **Adjust rate limits**: Modify the delay between requests per chain
5. **Enable/disable chains**: Control which chains are included in the comparison

Example configuration for additional chains:

```typescript
{
  name: 'World Chain',
  alchemyEndpoint: 'https://worldchain-mainnet.g.alchemy.com/nft/v3',
  contractAddress: process.env.WORLDCHAIN_CONTRACT_ADDRESS || '0x...',
  maxRequests: 50,
  requestDelay: 200,
  enabled: !!process.env.WORLDCHAIN_CONTRACT_ADDRESS,
},
```

## Output

### Console Output

The script provides detailed console output including:

- **Summary statistics**: Total owners per chain, unique owners, discrepancies count
- **Chain-exclusive owners**: Owners that exist only on specific chains
- **Detailed discrepancies**: Top discrepancies with token-level analysis
- **Progress indicators**: Real-time progress during data fetching

### JSON Report

Results are automatically saved to `data/cross-chain-comparison-[timestamp].json` with:

- Complete analysis results
- All discrepancies with detailed breakdowns
- Summary statistics
- Raw data for further analysis

### Example Output

```
🔍 CROSS-CHAIN OWNERSHIP COMPARISON RESULTS
📦 Collection: Aavegotchi Collection
🕒 Analysis completed at: 12/13/2024, 2:30:45 PM
================================================================================

📊 SUMMARY:
Collection: Aavegotchi Collection
Chains compared: Ethereum, Polygon, Arbitrum
Unique owners across all chains: 1,234
Owners on Ethereum: 1,100
Owners on Polygon: 1,200
Owners on Arbitrum: 1,050
Owners with discrepancies: 45
Total token discrepancies: 123

🏷️ CHAIN-EXCLUSIVE OWNERS:
Only on Ethereum: 34 owners
Only on Polygon: 56 owners
✓ No chain-exclusive owners found

⚠️ DISCREPANCIES FOUND:

1. 0x1234...abcd
  Ethereum: 5 total tokens (3 different token IDs)
  Polygon: 3 total tokens (2 different token IDs)
  Arbitrum: 4 total tokens (3 different token IDs)
  Token-level discrepancies:
    Token 1001:
      Ethereum: 2
      Polygon: 1
      Arbitrum: 2
```

## API Reference

### Key Functions

#### `fetchOwnersForContract(config: ChainConfig)`

Fetches all owners for a specific contract on a chain, handling pagination automatically.

#### `compareOwnershipData(chainData)`

Analyzes ownership data across chains and identifies discrepancies.

#### `printResults(result: ComparisonResult)`

Formats and displays results in the console.

### Types

```typescript
interface ChainConfig {
  name: string;
  alchemyEndpoint: string;
  contractAddress: string;
  apiKey: string;
}

interface ComparisonResult {
  summary: {
    totalOwners: { [chainName: string]: number };
    uniqueOwners: number;
    ownersWithDiscrepancies: number;
    tokenDiscrepancies: number;
  };
  discrepancies: OwnerComparison[];
  detailedReport: {
    ownersOnlyOnChain: { [chainName: string]: string[] };
    completeMatches: OwnerComparison[];
  };
}
```

## Troubleshooting

### Common Issues

1. **API Rate Limits**: The script includes built-in delays, but you can increase them if needed
2. **Large Datasets**: For contracts with >50,000 owners, the script uses pagination automatically
3. **Network Errors**: The script will retry failed requests and continue with available data
4. **Missing API Keys**: Chains without API keys are automatically skipped with warnings

### Error Messages

- `"ALCHEMY_API_KEY is required"`: Add your Alchemy API key to your `.env` file
- `"At least 2 enabled chains are required"`: Enable more chains in the script configuration
- `"HTTP 401: Unauthorized"`: Check your API key is correct
- `"HTTP 429: Too Many Requests"`: Increase the delay between requests in the configuration

## Performance Considerations

- **Large contracts**: May take several minutes to fetch all ownership data
- **Rate limits**: Alchemy has rate limits; the script includes delays to respect them
- **Memory usage**: Large datasets are processed in memory; monitor usage for very large contracts

## Historical Snapshot Comparisons

### Use Cases for Block-Specific Queries

1. **Airdrop Snapshots**: Compare ownership at specific blocks to ensure fair distribution
2. **Migration Analysis**: Track ownership changes before and after contract migrations
3. **Event-Based Analysis**: Compare states before/after significant events
4. **Audit Trails**: Verify historical ownership data for compliance

### Example: Comparing at Specific Blocks

```typescript
chains: [
  {
    name: 'BaseSepolia',
    alchemyEndpoint: 'https://base-sepolia.g.alchemy.com/nft/v3',
    contractAddress: baseSepoliaAddresses.installationsDiamond,
    blockNumber: '12345678', // Snapshot at specific block
    enabled: true,
  },
  {
    name: 'Polygon',
    alchemyEndpoint: 'https://polygon-mainnet.g.alchemy.com/nft/v3',
    contractAddress: polygonAddresses.installationsDiamond,
    blockNumber: '56789012', // Corresponding block on Polygon
    enabled: true,
  },
];
```

## Supported Networks

The script supports all Alchemy-compatible networks:

- Ethereum Mainnet
- Polygon
- Arbitrum
- Optimism
- Base
- World Chain
- And more...

See [Alchemy's documentation](https://docs.alchemy.com/reference/nft-api-quickstart#supported-networks) for the complete list.

## Contributing

To add support for additional chains or features:

1. Update the `COLLECTION_CONFIG.chains` array in the main script
2. Set the contract addresses directly in the configuration
3. Update this README with new configuration options
4. Test with the new chain before submitting changes

## File Structure

```
scripts/cross-chain-comparison/
├── compareOwnersAcrossChains.ts  # Main comparison script
├── advanced-config.ts           # Extended configuration utilities
├── config.example.env          # Environment variable template
└── README.md                   # This documentation
```
