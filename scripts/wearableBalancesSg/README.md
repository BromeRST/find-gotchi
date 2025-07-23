# Wearable Balance Subgraph Comparison

This script compares wearable item balances between the Base Sepolia subgraph and on-chain contract data to identify discrepancies and ensure data consistency.

## Overview

The script performs the following operations:

1. **Item Discovery**: Automatically discovers all available wearable item IDs from the Base Sepolia subgraph
2. **Subgraph Data Fetching**: For each item, retrieves all owners and their balances from the subgraph
3. **On-Chain Verification**: Fetches actual balances from the Base Sepolia wearable diamond contract
4. **Balance Comparison**: Compares subgraph vs on-chain data to identify:
   - Addresses missing from subgraph but present on-chain
   - Addresses present in subgraph but missing on-chain
   - Balance mismatches between subgraph and on-chain data
5. **Reporting**: Generates detailed reports with summary statistics and saves results to JSON files

## Prerequisites

### Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Required: Subgraph API key from Satsuma
SUBGRAPH_KEY=your_satsuma_api_key_here

# Required: Base Sepolia RPC URL
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/your-api-key
```

### Dependencies

All required dependencies are already included in the main `package.json`:

- `graphql-request`: For subgraph queries
- `ethers`: For blockchain interactions
- `chalk`: For colored console output
- `dotenv`: For environment variable management

## Configuration

The script can be configured by modifying the `getConfig()` function in `index.ts`:

```typescript
function getConfig(): Config {
  return {
    subgraphEndpoint: BASE_SEPOLIA_SG_ENDPOINT,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL!,
    contractAddress: baseSepoliaAddresses.wearableDiamond,
    blockNumber: undefined, // Use latest block or specify a specific block
    batchSize: 50, // Batch size for contract calls
    maxItemId: 1000, // Maximum item ID to check during discovery
    requestDelay: 250, // Delay between requests in ms
    maxRetries: 3, // Maximum retries for failed requests
  };
}
```

### Configuration Options

- **`blockNumber`**: Set to a specific block number for historical comparisons, or `undefined` for latest
- **`batchSize`**: Number of addresses to process in each contract call batch
- **`maxItemId`**: Maximum item ID to check during discovery phase
- **`requestDelay`**: Delay between requests to avoid rate limiting
- **`maxRetries`**: Number of retry attempts for failed requests

## Usage

### Running the Script

From the project root directory:

```bash
# Navigate to the script directory
cd scripts/wearableBalancesSg

# Run the comparison
npm run ts-node index.ts
```

Or from the project root:

```bash
npx ts-node scripts/wearableBalancesSg/index.ts
```

### Sample Output

```
Starting Wearable Balance Comparison (Base Sepolia)
============================================================

Configuration:
- Subgraph: https://subgraph.satsuma-prod.com/.../aavegotchi-core-baseSepolia/...
- RPC URL: https://base-sepolia.g.alchemy.com/v2/...
- Contract: 0x7e1Df5ad57C011E3bFA029041935aece51f35ccC
- Block Number: latest
- Max Item ID: 1000

Discovering available item IDs from subgraph...
Found item ID: 1
Found item ID: 2
Found item ID: 3
...
Discovered 15 item IDs with owners

Found 15 items to analyze

[1/15] Processing item 1
Fetching subgraph owners for item ID: 1
Found 5 owners for item 1 in subgraph
Fetching on-chain balances for 5 addresses for item 1
Found 5 non-zero on-chain balances for item 1
Comparing balances for item 1...
No discrepancies found for item 1

...

============================================================
WEARABLE BALANCE COMPARISON SUMMARY
============================================================
Timestamp: 2024-01-20T10:30:45.123Z
Total Items Checked: 15
Items with Discrepancies: 2
Total Discrepancies: 3

Summary Statistics:
Total Subgraph Owners: 156
Total On-Chain Owners: 158
Total Subgraph Balance: 1,234
Total On-Chain Balance: 1,237

Discrepancy Breakdown:
Missing from Subgraph: 2
Missing from On-Chain: 0
Balance Mismatches: 1

Items with Discrepancies:
Item 5: 2 discrepancies
Item 12: 1 discrepancies
============================================================

Results saved to: .../results/wearable-balance-comparison-2024-01-20T10-30-45-123Z.json
Detailed discrepancies saved for 2 items
Comparison completed successfully!
```

## Output Files

The script generates the following output files in the `results/` directory:

### 1. Full Comparison Results

`wearable-balance-comparison-{timestamp}.json`

Contains complete analysis results including:

- Configuration used
- Summary statistics
- All item analyses (with and without discrepancies)
- Timestamp and metadata

### 2. Discrepancies Only

`wearable-balance-discrepancies-{timestamp}.json`

Contains only items that have discrepancies, useful for focused analysis and debugging.

## Understanding Results

### Discrepancy Types

- **`missing_from_subgraph`**: Address has balance on-chain but not in subgraph
- **`missing_from_onchain`**: Address has balance in subgraph but not on-chain
- **`balance_mismatch`**: Address exists in both but with different balances

### Item Analysis Structure

Each item analysis includes:

```json
{
  "itemId": "1",
  "totalSubgraphOwners": 5,
  "totalOnChainOwners": 5,
  "totalSubgraphBalance": "10",
  "totalOnChainBalance": "10",
  "balancesMatch": true,
  "discrepancies": []
}
```

### Discrepancy Details

For items with discrepancies:

```json
{
  "discrepancies": [
    {
      "address": "0x1234...",
      "subgraphBalance": "2",
      "onChainBalance": "3",
      "discrepancy": "-1",
      "discrepancyType": "balance_mismatch"
    }
  ]
}
```

## Error Handling

The script includes robust error handling:

- **Retry Logic**: Failed requests are retried with exponential backoff
- **Rate Limiting**: Built-in delays to avoid overwhelming APIs
- **Graceful Degradation**: Individual item failures don't stop the entire process
- **Detailed Logging**: Clear error messages with context

## Performance Considerations

- **Batch Processing**: Contract calls are batched to minimize RPC requests
- **Rate Limiting**: Configurable delays prevent API rate limit issues
- **Memory Efficient**: Processes items sequentially to manage memory usage
- **Connection Pooling**: Reuses RPC connections for efficiency

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**

   ```
   Error: SUBGRAPH_KEY environment variable is required
   ```

   Solution: Ensure `.env` file exists with required variables

2. **RPC Rate Limiting**

   ```
   Error: Too Many Requests
   ```

   Solution: Increase `requestDelay` in configuration

3. **Network Timeouts**
   ```
   Error: network timeout
   ```
   Solution: Check internet connection and RPC provider status

### Debug Mode

For detailed debugging, modify the script to increase logging verbosity or reduce batch sizes and delays.
