# Wearables Comparison Script

This script analyzes Aavegotchi wearable ownership by comparing data from the subgraph with on-chain contract balances across multiple chains (Polygon and Base).

## Overview

The script performs the following operations:

1. **Multi-Chain Analysis**: Analyzes both Polygon and Base chains
2. **Discovers Item IDs**: Automatically finds all available wearable item IDs from 0 upwards per chain
3. **Fetches Subgraph Data**: For each item, retrieves all owners and their balances from the respective chain subgraph
4. **Verifies Contract Balances**:
   - **Polygon**: Calls the `aavegotchiDiamond` contract to verify balances
   - **Base Sepolia**: Calls the `wearableDiamond` contract to verify balances
5. **Tracks Equipped Wearables**:
   - Monitors which Aavegotchis have each wearable equipped
   - Identifies discrepancies in equipped wearables between chains
   - Reports missing Aavegotchi IDs that should have wearables equipped
6. **Compares Results**: Identifies discrepancies between:
   - Subgraph and contract data per chain
   - Contract balances between chains
   - Equipped wearables between chains
   - Missing Aavegotchi IDs between chains
7. **Generates Reports**: Provides detailed analysis and summary statistics including:
   - Chain-specific data and discrepancies
   - Missing items between chains
   - Balance mismatches
   - Missing Aavegotchi IDs for equipped wearables

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
5. **Cross-Chain Analysis**:
   - Items missing from each chain
   - Balance discrepancies between chains
   - Aavegotchi IDs with missing equipped wearables
6. **Final Report**: Overall analysis with:
   - Accuracy percentages
   - Total discrepancies breakdown
   - Chain-specific statistics
   - Detailed equipped wearables analysis

### Example Output

```
🚀 Starting Cross-Chain Wearables Comparison

Finding items with owners on Polygon...
Finding items with owners on Base Sepolia...
✓ Combined total items found: 300
  - Polygon items: 290
  - Base Sepolia items: 285

🔍 Analyzing Cross-Chain Item ID: 1
  Fetching owners from both chains...
  Processing contract balances...
  Checking equipped wearables...

📊 CROSS-CHAIN COMPARISON SUMMARY
================================
Chain-Specific Data:
  Polygon:
    Total items: 290
    Total owners: 15000
    Unique owners (Polygon only): 150
  Base Sepolia:
    Total items: 285
    Total owners: 14800
    Unique owners (Base Sepolia only): 120

Discrepancy Breakdown:
  Polygon only: 50
  Base Sepolia only: 45
  Balance mismatches: 25

Items with Missing Aavegotchi IDs:
  Item 123:
    Missing from Base Sepolia (5): 1234, 1235, 1236...
    Missing from Polygon (3): 5678, 5679, 5680

Cross-chain consistency: 98.50%
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

## Advanced Features

### Cross-Chain Comparison

The script includes advanced cross-chain comparison features:

1. **Balance Verification**:

   - Compares total balances between chains
   - Identifies addresses with different balances
   - Reports chain-specific discrepancies

2. **Equipped Wearables Tracking**:

   - Monitors which Aavegotchis have wearables equipped
   - Identifies missing equipped wearables between chains
   - Reports Aavegotchi IDs that need attention

3. **Discrepancy Analysis**:

   - Only reports items with actual discrepancies
   - Provides detailed breakdown of missing items
   - Shows missing Aavegotchi IDs for debugging

4. **JSON Output**:
   - Saves detailed comparison results to JSON
   - Includes timestamp for historical tracking
   - Perfect for automated analysis and debugging

### Performance Considerations

For optimal performance when running cross-chain analysis:

- Use reliable RPC endpoints with high rate limits
- Consider running at off-peak hours
- Adjust batch sizes based on RPC capabilities
- Monitor rate limiting on both chains
