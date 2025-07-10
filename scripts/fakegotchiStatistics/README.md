# Fake Gotchi Statistics Comparison

This script compares `fakeGotchiStatistics` data between Polygon and Base Sepolia subgraphs to identify token IDs that exist on one chain but not the other.

## Purpose

The primary goal is to find token IDs that exist on Polygon but not on Base Sepolia subgraphs. This helps identify discrepancies in cross-chain data synchronization and ensures data integrity across different networks.

## Features

- ✅ Fetches `fakeGotchiStatistics` data from both Polygon and Base Sepolia subgraphs
- ✅ Extracts all token IDs from both datasets
- ✅ Identifies token IDs that exist only on Polygon
- ✅ Identifies token IDs that exist only on Base Sepolia
- ✅ Shows common token IDs between both chains
- ✅ Provides detailed statistics comparison
- ✅ Saves results to JSON files with timestamps
- ✅ Colorful console output with comprehensive summaries

## GraphQL Query Used

```graphql
{
  fakeGotchiStatistics(first: 1000, orderBy: id) {
    id
    tokenIds
    amountHolder
    burned
    totalSupply
    holders {
      id
      holder {
        id
      }
      amount
    }
  }
}
```

## Prerequisites

1. **Environment Variables**: Set up a `.env` file in the project root with:

   ```env
   SUBGRAPH_KEY=your_subgraph_key_here
   ```

2. **Dependencies**: All required dependencies are already included in the main project's `package.json`.

## Usage

### Run the comparison script:

```bash
npm run compare-fakegotchi-statistics
```

or

```bash
yarn compare-fakegotchi-statistics
```

or directly with ts-node:

```bash
ts-node scripts/fakegotchiStatistics/index.ts
```

## Output

### Console Output

The script provides a comprehensive console summary including:

- **Overview**: Total statistics and unique token IDs compared
- **Token ID Distribution**: Count of exclusive and common token IDs
- **Detailed Lists**: First 20 token IDs that exist only on Polygon
- **Coverage Analysis**: Percentage coverage for each chain
- **Statistics Comparison**: Discrepancies in statistics records

### Saved Results

Results are automatically saved to `scripts/fakegotchiStatistics/results/` with filename format:
`fakegotchi-statistics-comparison-{timestamp}.json`

The JSON file contains:

```typescript
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "totalStatisticsCompared": 100,
  "polygonOnlyTokenIds": ["1", "2", "3"],
  "baseSpoliaOnlyTokenIds": ["4", "5"],
  "commonTokenIds": ["6", "7", "8"],
  "summary": {
    "polygonOnlyCount": 3,
    "baseSepoliaOnlyCount": 2,
    "commonCount": 3,
    "totalUniqueTokenIds": 8
  },
  "detailedComparison": {
    // Statistics-level discrepancies
  }
}
```

## Key Differences from `fakegotchisMetadataComparison`

1. **Data Focus**: Compares statistics data instead of metadata
2. **Token ID Analysis**: Specifically extracts and compares token IDs arrays
3. **Chain-Specific Results**: Designed to find Polygon-only token IDs
4. **Statistics Fields**: Compares `amountHolder`, `burned`, `totalSupply`, and `holders` data

## Error Handling

- **Rate Limiting**: Built-in delays between requests (300ms)
- **Retry Logic**: Automatic retries with exponential backoff
- **Validation**: Environment variable validation
- **Graceful Shutdown**: Handles SIGINT and SIGTERM signals

## Troubleshooting

### Common Issues

1. **Missing SUBGRAPH_KEY**: Ensure the environment variable is set correctly
2. **Network Issues**: The script includes retry logic for temporary network failures
3. **Memory Issues**: Large datasets are processed in batches to manage memory usage

### Debug Information

The script provides detailed logging including:

- Batch fetching progress
- Total items fetched per chain
- Comparison progress
- Error details with stack traces

## File Structure

```
scripts/fakegotchiStatistics/
├── index.ts              # Main script entry point
├── lib/
│   ├── types.ts          # TypeScript interfaces
│   ├── fetchers.ts       # GraphQL data fetching logic
│   └── comparison.ts     # Token ID comparison logic
├── results/              # Generated result files
└── README.md            # This documentation
```
