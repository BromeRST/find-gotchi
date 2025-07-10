# Aavegotchi Metadata Comparison

This script compares Aavegotchi metadata between Polygon and Base Sepolia networks to identify discrepancies.

## New Feature: Wearable Set Calculation Fix

The script now includes automatic fixing of wearable set calculations for Polygon data. This addresses discrepancies in:

- `withSetsRarityScore`
- `withSetsNumericTraits`
- `equippedSetID`
- `equippedSetName`

### How It Works

The script uses the same logic as the Aavegotchi subgraph to calculate wearable set bonuses:

1. **Find Equipped Sets**: Calls `findWearableSets()` on the Aavegotchi Diamond contract with equipped wearable IDs
2. **Get Set Information**: Retrieves all wearable sets using `getWearableSets()`
3. **Select Best Set**: Chooses the set with the most wearables equipped
4. **Calculate Bonuses**: Applies trait bonuses and BRS bonuses from the equipped set
5. **Update Fields**: Updates the gotchi's set-related metadata fields

### Environment Setup

You only need to add your subgraph key to your `.env` file:

```bash
SUBGRAPH_KEY=your_subgraph_key_here
```

**Note**: The wearable set calculation now uses local data from `lib/setsList.ts`, so no Polygon RPC access is required!

### Testing

You can test the wearable set calculation functionality:

```bash
yarn test-wearable-sets
```

This will:

- Test set calculation with known wearable combinations
- Test handling of Aavegotchis with no equipped wearables
- Verify the calculation logic is working correctly

### Usage

Run the comparison with set fixing:

```bash
yarn compare-aavegotchi-metadata
```

The script will:

1. Fetch Aavegotchi metadata from both Polygon and Base Sepolia
2. Fix Polygon wearable set calculations using on-chain contract calls
3. Compare the corrected data and generate a detailed report

### Performance Notes

- The script processes Polygon data using local wearable set data (no RPC calls needed!)
- Set calculations are now instantaneous using the built-in `setsList.ts`
- Progress is logged every 1000 processed Aavegotchis
- Much faster than the previous RPC-based approach

### Block Number

The script uses block `73121283` for Polygon subgraph data to ensure consistent historical state during comparison. Wearable set calculations use the current set definitions from `lib/setsList.ts`.

## Original Functionality

The script compares metadata between chains and identifies:

- **Identical Aavegotchis**: Same data on both chains
- **Discrepant Aavegotchis**: Different field values between chains
- **Missing Aavegotchis**: Present on one chain but not the other

### Fields Compared

- Basic stats (level, experience, kinship, etc.)
- Rarity scores (base, modified, with-sets)
- Numeric traits (base, modified, with-sets)
- Set information (ID, name)
- Timestamps and interactions

### Output

Results are saved to `scripts/aavegotchiMetadataComparison/results/` with:

- Summary statistics
- Detailed discrepancy breakdown
- Sample comparisons
- Missing Aavegotchi lists

### Prerequisites

1. Set up environment variables in `.env`:

   ```bash
   SUBGRAPH_KEY=your_subgraph_key_here
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

### Example Output

```
=== AAVEGOTCHI METADATA COMPARISON SUMMARY ===
Timestamp: 2024-01-15T10:30:00.000Z
Total Aavegotchis Compared: 15000
Total Discrepancies Found: 1200

--- Breakdown ---
Identical: 13800
With Discrepancies: 1200
Missing on Polygon: 0
Missing on Base Sepolia: 0

--- Discrepancies by Field ---
withSetsRarityScore: 1200 (FIXED by set calculation)
withSetsNumericTraits: 1200 (FIXED by set calculation)
equippedSetID: 800 (FIXED by set calculation)
equippedSetName: 800 (FIXED by set calculation)
```

With the new set calculation fix, many discrepancies that were previously reported should now be resolved automatically.

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
- **Base Sepolia**: `aavegotchi-core-baseSepolia/version/baseSepolia-test-mints-27`

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
