# Parcel Gotchiverse Comparison

This script compares Parcel Gotchiverse metadata between two subgraphs to identify discrepancies and ensure data consistency across different networks or subgraph deployments.

## Overview

The script fetches parcel data from two different gotchiverse subgraphs and performs a comprehensive comparison of all metadata fields from the VerseParcelInfo fragment, including:

- Parcel identification (id, parcelId, tokenId, parcelHash)
- Coordinates and district information (coordinateX, coordinateY, district)
- Boost values (alphaBoost, fomoBoost, fudBoost, kekBoost)
- Trading information (activeListing, auctionId, historicalPrices)
- Ownership information (ownerAddress)
- Parcel properties (size, surveyRound)
- Alchemica information (remainingAlchemica)
- Equipment information (equippedInstallations, equippedTiles)

## Features

- **Comprehensive Field Comparison**: Compares all fields from the VerseParcelInfo fragment
- **Missing Entity Detection**: Identifies parcels that exist on one subgraph but not the other
- **Pagination Support**: Efficiently handles large datasets using ID-based pagination
- **Retry Logic**: Robust error handling with exponential backoff
- **Detailed Reporting**: Generates comprehensive reports with statistics and examples
- **JSON Output**: Saves detailed results to timestamped JSON files
- **Complex Object Comparison**: Handles nested objects and arrays (installations, tiles, alchemica)

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
cd scripts/parcelGotchiverseComparison
npx ts-node index.ts

# Or using yarn from project root
yarn ts-node scripts/parcelGotchiverseComparison/index.ts
```

## GraphQL Fragment Used

The script uses the following GraphQL fragment as specified:

```graphql
fragment VerseParcelInfo on Parcel {
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
  ownerAddress
  parcelHash
  parcelId
  size
  tokenId
  remainingAlchemica
  surveyRound
  equippedInstallations {
    id
    installationType
    name
    level
  }
  equippedTiles {
    id
    amount
    tileType
  }
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
🚀 Starting Parcel Gotchiverse Comparison
This script compares parcel gotchiverse metadata between two subgraphs

Configured chains: Polygon Gotchiverse, Base Sepolia Gotchiverse

📡 Fetching data from subgraphs...
🔍 Fetching parcels from Polygon Gotchiverse...
📦 Fetching batch: lastId="", first=1000
✅ Fetched 1000 parcels. Total so far: 1000 (last id: 1000)
...

✅ Data fetching completed:
  • Polygon Gotchiverse: 50000 parcels
  • Base Sepolia Gotchiverse: 49950 parcels

🔍 Starting parcel gotchiverse metadata comparison...
Comparing 50000 unique parcels...
✅ Parcel gotchiverse metadata comparison completed
📊 Results: 49900 identical, 100 discrepant
📊 Missing: 50 on Polygon Gotchiverse, 0 on Base Sepolia Gotchiverse

💾 Results saved to: results/parcel-gotchiverse-comparison-2024-01-15T10-30-00-000Z.json

================================================================================
📊 PARCEL GOTCHIVERSE COMPARISON SUMMARY
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
  • equippedInstallations: 45 discrepancies
  • remainingAlchemica: 40 discrepancies
  • ownerAddress: 30 discrepancies
  • equippedTiles: 25 discrepancies
  • surveyRound: 10 discrepancies

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
      "equippedInstallations": 45,
      "remainingAlchemica": 40,
      "ownerAddress": 30
    }
  },
  "discrepanciesByToken": {
    "parcel789": [
      {
        "tokenId": "parcel789",
        "field": "equippedInstallations",
        "subgraph1Value": [{ "id": "inst1", "level": "1" }],
        "subgraph2Value": [{ "id": "inst1", "level": "2" }],
        "discrepancyType": "value_mismatch"
      }
    ]
  }
}
```

## Configuration

The script is configured to compare:

- **Polygon Gotchiverse**: `aavegotchi-gotchiverse-matic`
- **Base Sepolia Gotchiverse**: `aavegotchi-gotchiverse-baseSepolia`

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

The VerseParcelInfo fragment includes the following fields:

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
- `ownerAddress`: Owner wallet address
- `parcelHash`: Hash of the parcel
- `parcelId`: Parcel ID number
- `size`: Size category of the parcel
- `tokenId`: Token ID of the parcel NFT
- `remainingAlchemica`: Object containing remaining alchemica amounts by type
- `surveyRound`: Survey round number
- `equippedInstallations`: Array of equipped installations with their properties
- `equippedTiles`: Array of equipped tiles with their properties

## Complex Data Structures

The script handles complex nested objects and arrays:

### Equipped Installations

```typescript
equippedInstallations: {
  id: string;
  installationType: string;
  name: string;
  level: string;
}
[];
```

### Equipped Tiles

```typescript
equippedTiles: {
  id: string;
  amount: string;
  tileType: string;
}
[];
```

### Remaining Alchemica

```typescript
remainingAlchemica: {
  [alchemicaType: string]: string;
}
```

## Troubleshooting

### Common Issues

1. **Missing SUBGRAPH_KEY**: Ensure the environment variable is set correctly
2. **Network Timeouts**: The script includes retry logic; intermittent failures should resolve automatically
3. **Memory Issues**: For very large datasets, consider running with increased Node.js memory limit:
   ```bash
   node --max-old-space-size=4096 index.ts
   ```
4. **Complex Object Comparison**: The script normalizes and sorts complex objects for accurate comparison

### Debug Mode

To enable verbose logging, you can modify the script to include additional debug information by uncommenting debug statements in the fetcher functions.

## Contributing

When contributing to this script:

1. Follow the existing TypeScript patterns
2. Add appropriate error handling for new features
3. Update this README for any configuration changes
4. Test with small datasets before running full comparisons
5. Consider the complexity of nested objects when adding new fields

## Differences from Core Comparison

This gotchiverse comparison script differs from the core comparison in several ways:

1. **Additional Fields**: Includes gotchiverse-specific fields like `remainingAlchemica`, `surveyRound`, `equippedInstallations`, and `equippedTiles`
2. **Owner Field**: Uses `ownerAddress` instead of nested `owner.id` structure
3. **Complex Objects**: Handles arrays of objects for installations and tiles
4. **Enhanced Normalization**: Improved sorting for complex nested arrays
