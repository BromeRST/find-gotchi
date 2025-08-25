# Installations Comparison Script

This script compares equipped installations data between two Aavegotchi subgraphs: Polygon Gotchiverse and Base Gotchiverse. It fetches all equipped installations from both subgraphs and identifies discrepancies in their metadata.

## Overview

The script performs a comprehensive comparison of equipped installations across two different subgraph endpoints:

- **Polygon Gotchiverse**: The original Polygon-based subgraph
- **Base Gotchiverse**: The Base chain subgraph

## What it Compares

For each equipped installation, the script compares:

- `id` - Unique installation identifier
- `x` - X coordinate position
- `y` - Y coordinate position
- `parcel` - Associated parcel information
  - `id` - Parcel identifier
- `type` - Installation type information
  - `id` - Installation type identifier

## Query Used

The script uses the following GraphQL query to fetch equipped installations:

```graphql
{
  installations(first: 1000, where: { equipped: true }) {
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

- **Comprehensive Data Fetching**: Automatically paginates through all equipped installations
- **Detailed Comparison**: Identifies exact differences between subgraphs
- **Missing Data Detection**: Reports installations present in one subgraph but not the other
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

# Run the installations comparison
npx ts-node scripts/installationsComparison/index.ts

# Or using the npm script
npm run compare-installations
```

### Command Line Options

The script currently runs with default settings. Configuration is handled through:

- Environment variables (`.env` file)
- Hardcoded subgraph endpoints in the script

## Output

### Console Output

The script provides real-time progress updates:

```
🚀 Starting Equipped Installations Comparison
📡 Fetching data from subgraphs...
🔍 Fetching equipped installations from Polygon Gotchiverse...
📦 Fetching batch: lastId="", first=1000
✅ Fetched 1000 installations. Total so far: 1000 (last id: 12345)
...
✅ Data fetching completed:
  • Polygon Gotchiverse: 3500 equipped installations
  • Base Gotchiverse: 3480 equipped installations

🔍 Starting equipped installations metadata comparison...
✅ Equipped installations metadata comparison completed
📊 Results: 3450 identical, 30 discrepant
📊 Missing: 20 on Polygon Gotchiverse, 0 on Base Gotchiverse
```

### Summary Report

After completion, the script displays a detailed summary:

```
================================================================================
📊 EQUIPPED INSTALLATIONS COMPARISON SUMMARY
================================================================================

📈 Overview:
  • Total installations compared: 3500
  • Identical: 3450
  • Discrepant: 50
  • Total discrepancies: 75

🔍 Missing Data:
  • Missing on Polygon: 20
  • Missing on Base: 0

📋 Discrepancies by Field:
  • x: 25 discrepancies
  • y: 20 discrepancies
  • type: 15 discrepancies
  • parcel: 10 discrepancies
  • id: 5 discrepancies

🔎 Sample Discrepancies:
  • Installation 12345: 3 discrepancies
    ≠ x: "10" vs "11"
    ≠ y: "5" vs "6"
    ≠ type: {"id":"100"} vs {"id":"101"}

✨ Data Accuracy:
  • 98.57% of equipped installations are identical between subgraphs
```

### Saved Results

Results are automatically saved to `scripts/installationsComparison/results/` with timestamps:

```
scripts/installationsComparison/results/installations-comparison-2024-01-15T10-30-45-123Z.json
```

The JSON file contains:

- Complete comparison results
- All discrepancies with detailed field-by-field differences
- Missing installations from each subgraph
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

- **Batch Size**: 1000 installations per request
- **Request Delay**: 300ms between requests
- **Max Retries**: 3 attempts with exponential backoff
- **Base Retry Delay**: 1000ms

## Data Structure

### InstallationInfo Interface

```typescript
interface InstallationInfo {
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
- Individual installation discrepancies with exact differences

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
- `scripts/tilesComparison/` - Compares tiles data
- `scripts/fakegotchisMetadataComparison/` - Compares fakegotchi metadata
- `scripts/parcelCoreComparison/` - Compares parcel core data

## Maintenance

To update the script:

1. **Endpoint Changes**: Update the `getChainConfigs()` function
2. **Query Modifications**: Update the `INSTALLATIONS_QUERY` in `lib/fetchers.ts`
3. **New Fields**: Add to `InstallationInfo` interface and comparison logic
4. **Block Numbers**: Update historical block numbers for consistency
