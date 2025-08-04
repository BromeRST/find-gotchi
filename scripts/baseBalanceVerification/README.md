# Base Mainnet Balance Verification

This script verifies wearable item balances between the Base mainnet subgraph and on-chain contract data to identify discrepancies and ensure data consistency.

## Overview

The script performs the following operations:

1. **Item Discovery**: Automatically discovers all available wearable item IDs from the Base mainnet subgraph
2. **Subgraph Data Fetching**: For each item, retrieves all owners and their balances from the subgraph
3. **On-Chain Verification**: Fetches actual balances from the Base mainnet wearable diamond contract
4. **Balance Comparison**: Compares subgraph vs on-chain data to identify:
   - Addresses missing from subgraph but present on-chain
   - Addresses present in subgraph but missing on-chain
   - Balance mismatches between subgraph and on-chain data
   - **Note**: Discrepancies for aavegotchidiamond addresses are automatically skipped (logged but not reported as errors)
5. **Reporting**: Generates detailed reports with summary statistics and saves results to JSON files

## Prerequisites

### Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Required: Subgraph API key from Satsuma
SUBGRAPH_KEY=your_satsuma_api_key_here

# Required: Base mainnet RPC URL
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/your-api-key
```

### Dependencies

All required dependencies are already included in the main `package.json`:

- `graphql-request`: For subgraph queries
- `ethers`: For blockchain interactions
- `chalk`: For colored console output
- `dotenv`: For environment variable management

## Usage

### Run the script with ts-node

```bash
npx ts-node scripts/baseBalanceVerification/index.ts
```

### Add to package.json scripts (optional)

You can add this to your `package.json` scripts section:

```json
{
  "scripts": {
    "verify-base-balances": "npx ts-node scripts/baseBalanceVerification/index.ts"
  }
}
```

Then run with:

```bash
yarn verify-base-balances
```

## Configuration

The script can be configured by modifying the `getConfig()` function in `index.ts`:

```typescript
function getConfig(): Config {
  return {
    subgraphEndpoint: BASE_MAINNET_SG_ENDPOINT,
    rpcUrl: process.env.BASE_RPC_URL!,
    contractAddress: baseAddresses.wearableDiamond,
    blockNumber: undefined, // Use latest block or set specific block number
    batchSize: 50, // Addresses per contract call
    maxItemId: 1000, // Maximum item ID to check
    requestDelay: 250, // Delay between requests in ms
    maxRetries: 3, // Maximum retries for failed requests
  };
}
```

### Configuration Options

- **blockNumber**: Set to a specific block number for historical analysis, or leave undefined for latest
- **batchSize**: Number of addresses to check per contract call (max recommended: 100)
- **maxItemId**: Maximum item ID to scan (increase if you have items with higher IDs)
- **requestDelay**: Delay between subgraph requests (increase if hitting rate limits)
- **maxRetries**: Number of retry attempts for failed operations

## Features

### Rate Limiting

- **Subgraph Queries**: 250ms delay between requests
- **Contract Calls**: 500ms delay between batch calls
- **Batch Processing**: Processes 50 addresses per contract call by default

### Automatic Discovery

- Scans item IDs from 0 up to configured maximum
- Only processes items that have owners in the subgraph
- Provides progress updates during discovery

### Comprehensive Analysis

- **Per-Item Reports**: Balance comparison for each wearable type
- **Discrepancy Detection**: Identifies addresses with different balances
- **Error Handling**: Gracefully handles RPC failures and rate limits
- **Summary Statistics**: Overall accuracy metrics and totals

### Efficient Contract Calls

- Uses `balanceOfBatch()` for multiple addresses simultaneously
- Reduces the number of RPC calls significantly
- Handles provider rate limits gracefully

### Smart Filtering

- **Aavegotchi Diamond Exclusion**: Automatically skips discrepancies for aavegotchi diamond addresses
- These addresses may have legitimate balance differences due to equipped wearables
- Skipped discrepancies are logged for transparency but not counted as errors

## Output

The script provides:

1. **Real-time Progress**: Shows current item being analyzed
2. **Batch Progress**: Updates on contract call batches
3. **Discrepancy Alerts**: Highlights balance differences
4. **Final Summary**: Comprehensive verification report with:
   - Total items checked
   - Total discrepancies found
   - Breakdown by discrepancy type
   - Summary statistics

### Example Output

```
🚀 Starting Base Mainnet Balance Verification
========================================

Configuration:
- Subgraph: https://subgraph.satsuma-prod.com/.../aavegotchi-core-base/api
- RPC URL: https://base-mainnet.g.alchemy.com/v2/...
- Contract: 0x052e6c114a166B0e91C2340370d72D4C33752B4b
- Block Number: latest
- Max Item ID: 1000

Discovering available item IDs from subgraph...
Found 245 items to analyze

[1/245] Processing item 0
Fetching subgraph owners for item ID: 0
Found 150 owners for item 0 in subgraph
Fetching on-chain balances for 150 addresses for item 0
Found 150 non-zero on-chain balances for item 0
Comparing balances for item 0...
  Skipping aavegotchidiamond discrepancy for item 0: 0xa99c4b08201f2913db8d28e71d020c4298f29dbf (SG: 45, OC: 52)
No discrepancies found for item 0

...

BASE MAINNET BALANCE VERIFICATION SUMMARY
========================================
Timestamp: 2024-01-15T10:30:00.000Z
Total Items Checked: 245
Items with Discrepancies: 3
Total Discrepancies: 15

Summary Statistics:
Total Subgraph Owners: 12,450
Total On-Chain Owners: 12,465
Total Subgraph Balance: 45,890
Total On-Chain Balance: 45,905

Discrepancy Breakdown:
Missing from Subgraph: 10
Missing from On-Chain: 2
Balance Mismatches: 3

Items with Discrepancies:
Item 123: 8 discrepancies
Item 156: 4 discrepancies
Item 234: 3 discrepancies
```

## Output Files

The script generates two types of output files in the `results/` directory:

1. **Complete Results**: `base-balance-verification-{timestamp}.json`

   - Full comparison results with all items analyzed
   - Summary statistics and metadata

2. **Discrepancies Only**: `base-balance-discrepancies-{timestamp}.json` (only if discrepancies found)
   - Detailed information about items with balance mismatches
   - Useful for debugging and investigation

## Troubleshooting

### Common Issues

1. **Rate Limiting**: If you encounter rate limit errors, increase the `requestDelay` value
2. **RPC Errors**: Ensure your `BASE_RPC_URL` is valid and has sufficient quota
3. **Subgraph Errors**: Verify your `SUBGRAPH_KEY` is correct and active
4. **Memory Issues**: For large datasets, consider processing items in smaller batches

### Error Handling

The script includes robust error handling:

- Failed contract calls are retried with exponential backoff
- Network timeouts are handled gracefully
- Individual item failures don't stop the overall analysis
- Detailed error logging for debugging

### Performance Optimization

For faster execution (if your RPC allows):

- Decrease `requestDelay` (but watch for rate limits)
- Increase `batchSize` (max 200 addresses per call)
- Use a premium RPC provider with higher rate limits
- Set a specific `blockNumber` to avoid latest block inconsistencies

## Advanced Usage

### Historical Analysis

To analyze balances at a specific block:

```typescript
const config = getConfig();
config.blockNumber = 12345678; // Your desired block number
```

### Targeted Item Analysis

To check specific items only, modify the `discoverItemIds` call:

```typescript
// Instead of discovering, use specific item IDs
const itemIds = ['0', '1', '2', '123', '456'];
```

### Custom Contract Address

To verify a different contract, update the configuration:

```typescript
const config = getConfig();
config.contractAddress = '0xYourCustomContractAddress';
```
