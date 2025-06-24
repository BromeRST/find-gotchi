# Wearables Comparison Script

This script analyzes Aavegotchi wearable ownership by comparing data from the subgraph with on-chain contract balances across multiple chains (Polygon and Base Sepolia).

## Overview

The script performs the following operations:

1. **Multi-Chain Analysis**: Analyzes both Polygon and Base Sepolia chains
2. **Discovers Item IDs**: Automatically finds all available wearable item IDs from 0 upwards per chain
3. **Fetches Subgraph Data**: For each item, retrieves all owners and their balances from the respective chain subgraph
4. **Verifies Contract Balances**:
   - **Polygon**: Calls the `aavegotchiDiamond` contract to verify balances
   - **Base Sepolia**: Calls the `wearableDiamond` contract to verify balances
5. **Compares Results**: Identifies discrepancies between subgraph and contract data per chain
6. **Generates Reports**: Provides detailed analysis and summary statistics for each chain and overall

## Prerequisites

### Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Required: Subgraph API key from Satsuma
SUBGRAPH_KEY=your_satsuma_api_key_here

# Required: Polygon RPC URL (use Alchemy, Infura, or other provider)
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/your-api-key

# Required: Base Sepolia RPC URL
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/your-api-key
```

### Dependencies

All required dependencies are already included in the main `package.json`:

- `graphql-request` - GraphQL client for subgraph queries
- `ethers` - Ethereum library for contract interactions
- `chalk` - Terminal styling
- `dotenv` - Environment variable loading

## Usage

### Run the Complete Analysis

```bash
yarn analyze-wearables
```

### Run with ts-node directly

```bash
npx ts-node scripts/wearablesComparison/index.ts
```

### Historical Analysis with Block Numbers

To analyze wearable ownership at specific blocks, manually set the block numbers in the script:

```typescript
// In scripts/wearablesComparison/index.ts, update the chain configuration:
this.chains = [
  {
    name: 'Polygon',
    subgraphEndpoint,
    rpcUrl: process.env.POLYGON_RPC_URL,
    contractAddress: polygonAddresses.aavegotchiDiamond,
    blockNumber: 50000000, // Set your desired block number here
  },
  {
    name: 'Base Sepolia',
    subgraphEndpoint: sepoliaSgEndpoint,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL,
    contractAddress: baseSepoliaAddresses.wearableDiamond,
    blockNumber: 10000000, // Set your desired block number here
  },
];
```

This is useful for:

- **Historical comparisons**: Compare ownership before/after specific events
- **Bug investigation**: Analyze state at the time of reported issues
- **Audit purposes**: Verify ownership at specific timestamps

## Features

### Rate Limiting

- **Subgraph Queries**: 250ms delay between requests
- **Contract Calls**: 500ms delay between batch calls
- **Batch Processing**: Processes 50 addresses per contract call

### Automatic Discovery

- Finds maximum item ID by testing consecutive IDs
- Stops after 50 consecutive non-existent items

### Comprehensive Analysis

- **Per-Item Reports**: Balance comparison for each wearable type
- **Mismatch Detection**: Identifies addresses with different balances
- **Error Handling**: Gracefully handles RPC failures and rate limits
- **Final Summary**: Overall statistics and accuracy metrics
- **Historical Analysis**: Optional block number support for point-in-time analysis

### Efficient Contract Calls

- Uses `balanceOfBatch()` for multiple addresses simultaneously
- Reduces the number of RPC calls significantly
- Handles provider rate limits gracefully

## Output

The script provides:

1. **Real-time Progress**: Shows current item being analyzed
2. **Batch Progress**: Updates on contract call batches
3. **Mismatch Alerts**: Highlights balance discrepancies
4. **Item Summaries**: Statistics for each wearable type
5. **Final Report**: Overall analysis with accuracy percentages

### Example Output

```
🚀 Starting Wearables Analysis

Finding maximum item ID...
  Found item ID: 0
  Found item ID: 1
  ...
Maximum item ID found: 150

🔍 Analyzing Item ID: 0
Fetching owners for item ID: 0
  Fetched 1000 owners (total: 1000, skip: 1000)
  Fetched 500 owners (total: 1500, skip: 1500)
✓ Total owners found for item 0: 1500

Checking contract balances for 1500 owners...
  Processed batch 1/30
  Mismatch: 0x123...abc - Subgraph: 5, Contract: 3
  Processed batch 2/30
  ...

📊 Summary for Item ID 0:
  Total owners from subgraph: 1500
  Successfully checked: 1500
  Matching balances: 1485
  Mismatched balances: 15
  Errors: 0
  Accuracy: 99.00%
```

## Configuration

You can modify the following constants in the script:

```typescript
private readonly batchSize = 50;              // Addresses per contract call
private readonly requestDelay = 250;          // MS between subgraph requests
private readonly contractCallDelay = 500;     // MS between contract calls
```

## Troubleshooting

### Common Issues

1. **Rate Limiting**: If you encounter rate limit errors, increase the delay values
2. **RPC Errors**: Ensure your `POLYGON_RPC_URL` and `BASE_SEPOLIA_RPC_URL` are valid and have sufficient quota
3. **Subgraph Errors**: Verify your `SUBGRAPH_KEY` is correct and active

### Error Handling

The script includes robust error handling:

- Failed contract calls are logged and marked as errors
- Network timeouts are handled gracefully
- Individual item failures don't stop the overall analysis

### Performance Optimization

For faster execution (if your RPC allows):

- Decrease `requestDelay` and `contractCallDelay`
- Increase `batchSize` (max 200 addresses per call)
- Use a premium RPC provider with higher rate limits
