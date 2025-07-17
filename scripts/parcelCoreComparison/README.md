# Parcel Core Comparison

This script compares Parcel Core metadata between two subgraphs to identify discrepancies and ensure data consistency across different networks or subgraph deployments.

## Overview

The script fetches parcel data from two different subgraphs and performs a comprehensive comparison of all metadata fields from the CoreParcelInfo fragment, including:

- Parcel identification (id, parcelId, tokenId, parcelHash)
- Coordinates and district information (coordinateX, coordinateY, district)
- Boost values (alphaBoost, fomoBoost, fudBoost, kekBoost)
- Trading information (activeListing, auctionId, historicalPrices, timesTraded)
- Ownership information (owner)
- Parcel properties (size)

## Features

- **Comprehensive Field Comparison**: Compares all fields from the CoreParcelInfo fragment
- **Missing Entity Detection**: Identifies parcels that exist on one subgraph but not the other
- **Pagination Support**: Efficiently handles large datasets using ID-based pagination
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
cd scripts/parcelCoreComparison
npx ts-node index.ts

# Or using yarn from project root
yarn ts-node scripts/parcelCoreComparison/index.ts
```

## GraphQL Fragment Used

The script uses the following GraphQL fragment as specified:

```graphql
fragment CoreParcelInfo on Parcel {
  activeListing
  alphaBoost
  auctionId
  coordinateY
  coordinateX
  district
  fomoBoost
  fudBoost
  historicalPrices
  id
  kekBoost
  owner {
    id
  }
  parcelHash
  parcelId
  size
  timesTraded
  tokenId
}
```

## Query Strategy

The script uses ID-based pagination to fetch all parcels:

```graphql
parcels(
  first: 1000,
  where: { id_gt: $lastId },
  orderBy: id,
  orderDirection: asc
)
```

This approach ensures:

- Complete data retrieval without missing entities
- Efficient pagination using the id field
- Consistent ordering for reliable pagination

## Output

The script provides:

1. **Console Output**: Real-time progress and summary statistics
2. **JSON Results**: Detailed comparison results saved to `results/` directory

### Console Output Example

```
🚀 Starting Parcel Core Comparison
This script compares parcel core metadata between two subgraphs

Configured chains: Polygon, Base Sepolia

📡 Fetching data from subgraphs...
🔍 Fetching parcels from Polygon...
📦 Fetching batch: lastId="", first=1000
✅ Fetched 1000 parcels. Total so far: 1000 (last id: 1000)
...

✅ Data fetching completed:
  • Polygon: 50000 parcels
  • Base Sepolia: 49950 parcels

🔍 Starting parcel metadata comparison...
Comparing 50000 unique parcels...
✅ Parcel metadata comparison completed
📊 Results: 49900 identical, 100 discrepant
📊 Missing: 50 on Polygon, 0 on Base Sepolia

💾 Results saved to: results/parcel-core-comparison-2024-01-15T10-30-00-000Z.json

================================================================================
📊 PARCEL CORE COMPARISON SUMMARY
================================================================================

📈 Overview:
  • Total parcels compared: 50000
  • Identical: 49900
  • Discrepant: 100
  • Total discrepancies: 150

🔍 Missing Data:
  • Missing on Polygon: 50
  • Missing on Base Sepolia: 0

📋 Discrepancies by Field:
  • coordinateX: 45 discrepancies
  • coordinateY: 40 discrepancies
  • alphaBoost: 30 discrepancies
  • owner.id: 25 discrepancies
  • historicalPrices: 10 discrepancies

✨ Data Accuracy:
  • 99.80% of parcels are identical between subgraphs

================================================================================
Comparison completed at: 2024-01-15T10:30:00.000Z
================================================================================
```

### JSON Output Structure

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "totalCompared": 50000,
  "totalDiscrepancies": 150,
  "missingOnSubgraph1": ["parcel123", "parcel456"],
  "missingOnSubgraph2": [],
  "summary": {
    "identicalCount": 49900,
    "discrepantCount": 100,
    "missingSubgraph1Count": 50,
    "missingSubgraph2Count": 0,
    "discrepanciesByField": {
      "coordinateX": 45,
      "coordinateY": 40,
      "alphaBoost": 30
    }
  },
  "discrepanciesByToken": {
    "parcel789": [
      {
        "tokenId": "parcel789",
        "field": "coordinateX",
        "subgraph1Value": "100",
        "subgraph2Value": "101",
        "discrepancyType": "value_mismatch"
      }
    ]
  }
}
```

## Configuration

The script is configured to compare:

- **Polygon**: `aavegotchi-core-matic`
- **Base Sepolia**: `aavegotchi-core-baseSepolia`

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

- **Batch Size**: Fetches 1000 parcels per request for optimal performance
- **Parallel Fetching**: Data from both subgraphs is fetched simultaneously
- **Memory Efficient**: Uses Map data structures for efficient lookups during comparison
- **Progress Logging**: Real-time progress updates for long-running operations

## Field Descriptions

The CoreParcelInfo fragment includes the following fields:

- `activeListing`: Current active listing ID if the parcel is for sale
- `alphaBoost`: Alpha boost value for the parcel
- `auctionId`: Auction ID if the parcel is in an auction
- `coordinateX`: X coordinate of the parcel in the Gotchiverse
- `coordinateY`: Y coordinate of the parcel in the Gotchiverse
- `district`: District number where the parcel is located
- `fomoBoost`: FOMO boost value for the parcel
- `fudBoost`: FUD boost value for the parcel
- `historicalPrices`: Array of historical prices for the parcel
- `id`: Unique identifier for the parcel
- `kekBoost`: KEK boost value for the parcel
- `owner`: Owner information with their wallet address
- `parcelHash`: Hash of the parcel
- `parcelId`: Parcel ID number
- `size`: Size category of the parcel
- `timesTraded`: Number of times the parcel has been traded
- `tokenId`: Token ID of the parcel NFT

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
