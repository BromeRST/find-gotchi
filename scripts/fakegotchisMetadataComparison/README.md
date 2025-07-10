# Fake Gotchis Metadata Comparison

This script compares Fake Gotchi NFT metadata between two subgraphs to identify discrepancies and ensure data consistency across different networks or subgraph deployments.

## Overview

The script fetches Fake Gotchi NFT data from two different subgraphs and performs a comprehensive comparison of all metadata fields, including:

- Basic token properties (identifier, owner)
- Metadata information (name, description, artist, publisher details)
- File information (file hash, thumbnail hash, file type)
- Publishing details (editions, external links, timestamps)

## Features

- **Comprehensive Field Comparison**: Compares all fields from the MetadataInfo and FakeGotchiNFTTokenInfo fragments
- **Smart Burn Address Handling**: Different burn addresses (0x0000...0000, 0x0000...0001, 0x0000...dead, etc.) are treated as equivalent to avoid false discrepancies
- **Missing Entity Detection**: Identifies fake gotchis that exist on one subgraph but not the other
- **Pagination Support**: Efficiently handles large datasets using identifier-based pagination
- **Retry Logic**: Robust error handling with exponential backoff
- **Detailed Reporting**: Generates comprehensive reports with statistics and examples
- **JSON Output**: Saves detailed results to timestamped JSON files

## Prerequisites

1. Node.js and npm/yarn installed
2. Environment variables configured:
   - `SUBGRAPH_KEY`: Your Satsuma subgraph API key

## Environment Setup

Create a `.env` file in the project root with:

```env
SUBGRAPH_KEY=your_subgraph_api_key_here
```

## Usage

Run the comparison script:

```bash
# From the project root
cd scripts/fakegotchisMetadataComparison
npx ts-node index.ts

# Or using yarn from project root
yarn ts-node scripts/fakegotchisMetadataComparison/index.ts
```

## GraphQL Fragments Used

The script uses the following GraphQL fragments as specified:

```graphql
fragment MetadataInfo on MetadataActionLog {
  id
  name
  description
  publisherName
  artistName
  fileHash
  thumbnailHash
  externalLink
  fileType
  editions
  publisher {
    id
  }
  artist {
    id
  }
  createdAt
}

fragment FakeGotchiNFTTokenInfo on FakeGotchiNFTToken {
  id
  identifier
  owner {
    id
  }
  metadata {
    ...MetadataInfo
  }
}
```

## Query Strategy

The script uses identifier-based pagination to fetch all fake gotchis:

```graphql
fakeGotchiNFTTokens(
  first: 1000,
  where: { identifier_gt: $lastIdentifier },
  orderBy: identifier,
  orderDirection: asc
)
```

This approach ensures:

- Complete data retrieval without missing entities
- Efficient pagination using the identifier field
- Consistent ordering for reliable pagination

## Burn Address Handling

The script includes smart handling for burn addresses to avoid false discrepancies. When comparing the `owner` field, the following addresses are treated as equivalent (all represent "burned" tokens):

- `0x0000000000000000000000000000000000000000` (zero address)
- `0x0000000000000000000000000000000000000001` (zero address with 1)
- `0x000000000000000000000000000000000000dead` (dead address)
- `0xffffffffffffffffffffffffffffffffffffffff` (max address)
- `0x000000000000000000000000000000000000beef` (beef address)
- `0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead` (dead pattern)

This means that if one subgraph shows owner as `0x0000000000000000000000000000000000000000` and another shows `0x0000000000000000000000000000000000000001`, this will **not** be reported as a discrepancy since both represent burned tokens.

## Output

The script provides:

1. **Console Output**: Real-time progress and summary statistics
2. **JSON Results**: Detailed comparison results saved to `results/` directory

### Console Output Example

```
🚀 Starting Fake Gotchis Metadata Comparison
This script compares fake gotchi metadata between two subgraphs

Configured chains: Polygon, Base Sepolia

📡 Fetching data from subgraphs...
🔍 Fetching fake gotchis from Polygon...
📦 Fetching batch: lastIdentifier="", first=1000
✅ Fetched 1000 fake gotchis. Total so far: 1000 (last identifier: 1000)
...

✅ Data fetching completed:
  • Polygon: 5000 fake gotchis
  • Base Sepolia: 4950 fake gotchis

🔍 Starting metadata comparison...
Comparing 5000 unique fake gotchi tokens...
✅ Metadata comparison completed
📊 Results: 4900 identical, 100 discrepant
📊 Missing: 50 on Polygon, 0 on Base Sepolia

💾 Results saved to: results/fakegotchis-comparison-2024-01-15T10-30-00-000Z.json

================================================================================
📊 FAKE GOTCHIS METADATA COMPARISON SUMMARY
================================================================================

📈 Overview:
  • Total fake gotchis compared: 5000
  • Identical: 4900
  • Discrepant: 100
  • Total discrepancies: 150

🔍 Missing Data:
  • Missing on Polygon: 50
  • Missing on Base Sepolia: 0

📋 Discrepancies by Field:
  • metadata.fileHash: 45 discrepancies
  • metadata.thumbnailHash: 40 discrepancies
  • metadata.description: 30 discrepancies
  • owner.id: 25 discrepancies
  • metadata.externalLink: 10 discrepancies

✨ Data Accuracy:
  • 98.00% of fake gotchis are identical between subgraphs

================================================================================
Comparison completed at: 2024-01-15T10:30:00.000Z
================================================================================
```

### JSON Output Structure

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "totalCompared": 5000,
  "totalDiscrepancies": 150,
  "missingOnSubgraph1": ["token123", "token456"],
  "missingOnSubgraph2": [],
  "summary": {
    "identicalCount": 4900,
    "discrepantCount": 100,
    "missingSubgraph1Count": 50,
    "missingSubgraph2Count": 0,
    "discrepanciesByField": {
      "metadata.fileHash": 45,
      "metadata.thumbnailHash": 40,
      "metadata.description": 30
    }
  },
  "discrepanciesByToken": {
    "token789": [
      {
        "tokenId": "token789",
        "field": "metadata.fileHash",
        "subgraph1Value": "hash123",
        "subgraph2Value": "hash456",
        "discrepancyType": "value_mismatch"
      }
    ]
  }
}
```

## Configuration

The script is configured to compare:

- **Polygon**: `aavegotchi-fake-gotchis-matic`
- **Base Sepolia**: `aavegotchi-fake-gotchis-base-sepolia`

To modify the subgraph endpoints, edit the `getChainConfigs()` function in `index.ts`.

## Error Handling

The script includes robust error handling:

- **Retry Logic**: Failed requests are retried up to 3 times with exponential backoff
- **Rate Limiting**: 300ms delay between requests to avoid overwhelming the subgraphs
- **Graceful Shutdown**: Handles SIGINT/SIGTERM signals for clean termination
- **Detailed Error Reporting**: Provides comprehensive error messages and stack traces

## Exit Codes

- `0`: Comparison completed successfully with no discrepancies
- `1`: Comparison completed but discrepancies were found
- `130`: Script terminated by SIGINT (Ctrl+C)
- `143`: Script terminated by SIGTERM

## Performance Notes

- **Batch Size**: Fetches 1000 fake gotchis per request for optimal performance
- **Parallel Fetching**: Data from both subgraphs is fetched simultaneously
- **Memory Efficient**: Uses Map data structures for efficient lookups during comparison
- **Progress Logging**: Real-time progress updates for long-running operations

## Troubleshooting

### Common Issues

1. **Missing SUBGRAPH_KEY**: Ensure the environment variable is set correctly
2. **Network Timeouts**: The script includes retry logic; intermittent failures should resolve automatically
3. **Memory Issues**: For very large datasets, consider running with increased Node.js memory limit:
   ```bash
   node --max-old-space-size=4096 index.ts
   ```

### Debug Mode

To enable verbose logging, you can modify the script to include additional debug information by uncommenting debug statements in the fetcher functions.

## Contributing

When contributing to this script:

1. Follow the existing TypeScript patterns
2. Add appropriate error handling for new features
3. Update this README for any configuration changes
4. Test with small datasets before running full comparisons
