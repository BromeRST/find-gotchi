# Tiles Comparison Script

This script compares equipped tiles data between two Aavegotchi subgraphs: Polygon Gotchiverse and Base Gotchiverse. It fetches all equipped tiles from both subgraphs and identifies discrepancies in their metadata.

## Overview

The script performs a comprehensive comparison of equipped tiles across two different subgraph endpoints:

- **Polygon Gotchiverse**: The original Polygon-based subgraph
- **Base Gotchiverse**: The Base chain subgraph

## What it Compares

For each equipped tile, the script compares:

- `id` - Unique tile identifier
- `x` - X coordinate position
- `y` - Y coordinate position
- `parcel` - Associated parcel information
  - `id` - Parcel identifier
- `type` - Tile type information
  - `id` - Tile type identifier

## Query Used

The script uses the following GraphQL query to fetch equipped tiles:

```graphql
{
  tiles(first: 1000, where: { equipped: true }) {
    id
    x
    y
    parcel {
      id
    }
    type {
      id
    }
  }
}
```

## Features

- **Comprehensive Data Fetching**: Automatically paginates through all equipped tiles
- **Detailed Comparison**: Identifies exact differences between subgraphs
- **Missing Data Detection**: Reports tiles present in one subgraph but not the other
- **Field-Level Analysis**: Breaks down discrepancies by specific fields
- **Results Persistence**: Saves detailed comparison results to JSON files
- **Rate Limiting**: Implements proper delays between requests to avoid API limits
- **Retry Logic**: Automatically retries failed requests with exponential backoff
- **Colored Output**: Uses chalk for clear, colored terminal output

## Prerequisites

1. **Environment Variables**: Create a `.env` file in the project root with:

   ```
   SUBGRAPH_KEY=your_subgraph_key_here
   ```

2. **Dependencies**: The script uses existing project dependencies including:
   - `graphql-request` for GraphQL queries
   - `chalk` for colored output
   - `dotenv` for environment variable management

## Usage

### Running the Script

From the project root directory:

```bash
# Install dependencies (if not already installed)
npm install

# Run the tiles comparison
npx ts-node scripts/tilesComparison/index.ts
```

### Command Line Options

The script currently runs with default settings. Configuration is handled through:

- Environment variables (`.env` file)
- Hardcoded subgraph endpoints in the script

## Output

### Console Output

The script provides real-time progress updates:

```
🚀 Starting Equipped Tiles Comparison
📡 Fetching data from subgraphs...
🔍 Fetching equipped tiles from Polygon Gotchiverse...
📦 Fetching batch: lastId="", first=1000
✅ Fetched 1000 tiles. Total so far: 1000 (last id: 12345)
...
✅ Data fetching completed:
  • Polygon Gotchiverse: 2500 equipped tiles
  • Base Gotchiverse: 2480 equipped tiles

🔍 Starting equipped tiles metadata comparison...
✅ Equipped tiles metadata comparison completed
📊 Results: 2450 identical, 30 discrepant
📊 Missing: 20 on Polygon Gotchiverse, 0 on Base Gotchiverse
```

### Summary Report

After completion, the script displays a detailed summary:

```
================================================================================
📊 EQUIPPED TILES COMPARISON SUMMARY
================================================================================

📈 Overview:
  • Total tiles compared: 2500
  • Identical: 2450
  • Discrepant: 50
  • Total discrepancies: 75

🔍 Missing Data:
  • Missing on Polygon: 20
  • Missing on Base: 0

📋 Discrepancies by Field:
  • x: 25 discrepancies
  • y: 20 discrepancies
  • parcel: 15 discrepancies
  • id: 15 discrepancies

🔎 Sample Discrepancies:
  • Tile 12345: 3 discrepancies
    ≠ x: "10" vs "11"
    ≠ y: "5" vs "6"
    ≠ parcel: {"id":"100"} vs {"id":"101"}

✨ Data Accuracy:
  • 98.00% of equipped tiles are identical between subgraphs
```

### Saved Results

Results are automatically saved to `scripts/tilesComparison/results/` with timestamps:

```
scripts/tilesComparison/results/tiles-comparison-2024-01-15T10-30-45-123Z.json
```

The JSON file contains:

- Complete comparison results
- All discrepancies with detailed field-by-field differences
- Missing tiles from each subgraph
- Summary statistics
- Timestamp information

## Exit Codes

- `0`: Success - No discrepancies found
- `1`: Discrepancies found or script error
- `130`: Script interrupted (SIGINT)
- `143`: Script terminated (SIGTERM)

## Configuration

### Subgraph Endpoints

The script is configured to use:

1. **Polygon Gotchiverse**:

   - Endpoint: `https://subgraph.satsuma-prod.com/${SUBGRAPH_KEY}/aavegotchi/gotchiverse-matic/api`
   - Block Number: 74905712 (for historical consistency)

2. **Base Gotchiverse**:
   - Endpoint: `https://subgraph.satsuma-prod.com/${SUBGRAPH_KEY}/aavegotchi/gotchiverse-base/version/base-realm-5/api`
   - Block Number: Not specified (uses latest)

### Request Settings

- **Batch Size**: 1000 tiles per request
- **Request Delay**: 300ms between requests
- **Max Retries**: 3 attempts with exponential backoff
- **Base Retry Delay**: 1000ms

## Data Structure

### TileInfo Interface

```typescript
interface TileInfo {
  id: string;
  x: string;
  y: string;
  parcel: {
    id: string;
  };
  type: {
    id: string;
  };
}
```

### Comparison Result

The complete results include:

- Total comparison statistics
- Missing data on each subgraph
- Field-by-field discrepancy counts
- Individual tile discrepancies with exact differences

## Error Handling

The script includes comprehensive error handling:

- **Network Errors**: Automatic retry with exponential backoff
- **Rate Limiting**: Built-in delays between requests
- **Invalid Responses**: Graceful error reporting
- **Environment Issues**: Clear error messages for missing configuration

## Monitoring and Debugging

- Real-time progress updates during data fetching
- Detailed error messages with context
- Request attempt tracking for failed operations
- Batch processing status with counts and IDs

## Related Scripts

This script follows the same pattern as other comparison scripts in the project:

- `scripts/parcelGotchiverseComparison/` - Compares parcel data
- `scripts/fakegotchisMetadataComparison/` - Compares fakegotchi metadata
- `scripts/parcelCoreComparison/` - Compares parcel core data

## Maintenance

To update the script:

1. **Endpoint Changes**: Update the `getChainConfigs()` function
2. **Query Modifications**: Update the `TILES_QUERY` in `lib/fetchers.ts`
3. **New Fields**: Add to `TileInfo` interface and comparison logic
4. **Block Numbers**: Update historical block numbers for consistency
