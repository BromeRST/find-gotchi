# Aavegotchi Metadata Comparison

This script compares Aavegotchi metadata between Polygon and Base Sepolia chains to identify discrepancies between the two networks.

## Overview

The script fetches Aavegotchi data (ID 0-25000) from both chains and performs a comprehensive comparison of all metadata fields, including:

- Basic properties (name, level, kinship, experience, etc.)
- Numeric traits and rarity scores
- Equipped wearables and delegated wearables
- Owner information
- Historical data

## Features

- **Comprehensive Field Comparison**: Compares all fields from the AavegotchiInfo fragment
- **Missing Entity Detection**: Identifies Aavegotchis that exist on one chain but not the other
- **Batch Processing**: Efficiently handles large datasets with pagination
- **Retry Logic**: Robust error handling with exponential backoff
- **Block-specific Queries**: Uses specific block number (73121283) for Polygon queries
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
cd scripts/aavegotchiMetadataComparison
npx ts-node index.ts

# Or using yarn
yarn ts-node index.ts
```

## Output

The script provides:

1. **Console Output**: Real-time progress and summary statistics
2. **JSON Results**: Detailed comparison results saved to `results/` directory

### Console Output Example

```
Starting Aavegotchi Metadata Comparison...
Fetching Aavegotchis from Polygon...
Polygon: Fetched 1000 Aavegotchis (total: 1000)
...
Comparing metadata between chains...
Compared 1000 Aavegotchis...
...

=== AAVEGOTCHI METADATA COMPARISON SUMMARY ===
Timestamp: 2024-01-15T10:30:00.000Z
Total Aavegotchis Compared: 15000
Total Discrepancies Found: 25
```

### JSON Output Structure

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "totalCompared": 15000,
  "totalDiscrepancies": 25,
  "missingOnPolygon": ["1001", "1002"],
  "missingOnBaseSepolia": ["2001", "2002"],
  "discrepanciesByGotchi": {
    "1000": [
      {
        "gotchiId": "1000",
        "field": "level",
        "polygonValue": "5",
        "baseSepoliaValue": "4",
        "discrepancyType": "value_mismatch"
      }
    ]
  },
  "summary": {
    "identicalCount": 14975,
    "discrepantCount": 23,
    "missingPolygonCount": 1,
    "missingBaseSepoliaCount": 1
  }
}
```

## Configuration

### Chain Endpoints

The script uses these endpoints:

- **Polygon**: `aavegotchi-core-matic/version/matic-add-owners-to-wearables-6`
- **Base Sepolia**: `aavegotchi-core-baseSepolia/version/baseSepolia-test-mints-9`

### Block Number

Polygon queries use block number **73121283** for consistent historical comparison.

### Batch Size

- Default batch size: 1000 Aavegotchis per request
- Request delay: 300ms between batches
- Max retries: 3 with exponential backoff

## Error Handling

The script includes robust error handling:

- Automatic retries with exponential backoff
- Rate limiting protection
- Graceful handling of missing data
- Detailed error logging

## Results Directory

Results are saved to `scripts/aavegotchiMetadataComparison/results/` with timestamped filenames:

```
aavegotchi-metadata-comparison-2024-01-15T10-30-00-000Z.json
```

## Extending the Script

The script is modular and can be extended to:

- Compare additional metadata fields
- Use different block numbers or date ranges
- Generate reports in different formats
- Integrate with other analysis tools

## API Usage

The script exports functions for programmatic use:

```typescript
import { fetchAllAavegotchis, compareMetadata, main } from './index';

// Fetch data from a specific chain
const polygonData = await fetchAllAavegotchis(polygonConfig);

// Compare data between chains
const results = await compareMetadata(polygonData, baseSepoliaData);

// Run full comparison
await main();
```
