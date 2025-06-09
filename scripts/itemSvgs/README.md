# SVG Comparison Script

This script compares SVG results from the `getItemSvgs` function between Polygon and Base Sepolia chains.

## Setup

1. **Environment Variables**: Create a `.env` file in the root directory with the following variables:

```env
# Polygon RPC URL
POLYGON_RPC_URL=https://polygon-rpc.com

# Base Sepolia RPC URL
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Contract addresses for getItemSvgs function
POLYGON_CONTRACT_ADDRESS=0x...
BASE_SEPOLIA_CONTRACT_ADDRESS=0x...
```

2. **Contract ABI**: Update the `CONTRACT_ABI` in `compareSvgResults.ts` to match your actual contract interface if needed.

3. **Item Range**: The script is configured to compare all 417 Aavegotchi wearable items.

## Usage

Run the comparison script:

```bash
yarn compare-svgs
```

Or directly with ts-node:

```bash
ts-node scripts/compareSvgResults.ts
```

## Output

The script will:

1. Compare SVGs (front, back, left, right) for each item between the two chains
2. Generate a detailed report showing:
   - Total items compared (417 items)
   - Number of identical items
   - Number of different items
   - Number of errors
   - Discrepancy breakdown by view type (front, back, left, right)
   - Item IDs with specific differences
   - Detailed comparison for each item (only items with differences or errors)
3. Save results to `data/results/svg-comparison-{timestamp}.json`

**Note**: The JSON file only contains items with differences or errors. Identical items are excluded to keep the file size manageable and focus on issues that need attention.

## Configuration

You can modify these settings in the script:

- `BATCH_SIZE`: Number of items to process in parallel (default: 5, reduced for RPC limits)
- `MAX_ITEMS`: Total items to compare (set to 417 for all Aavegotchi wearables)
- `BATCH_DELAY_MS`: Delay between batches in milliseconds (default: 2000ms)
- `REQUEST_DELAY_MS`: Delay between individual requests within a batch (default: 100ms)

## Output Format

The generated JSON file contains:

```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "totalItemsCompared": 417,
  "identicalCount": 350,
  "differentCount": 60,
  "errorCount": 7,
  "polygonRpcUrl": "https://polygon-rpc.com",
  "baseSepoliaRpcUrl": "https://sepolia.base.org",
  "polygonContractAddress": "0x...",
  "baseSepoliaContractAddress": "0x...",
  "discrepancySummary": {
    "itemsWithFrontDifferences": [1, 5, 12, 25],
    "itemsWithBackDifferences": [3, 8, 15, 22],
    "itemsWithLeftDifferences": [2, 9, 18],
    "itemsWithRightDifferences": [4, 11, 20],
    "itemsWithMultipleDifferences": [1, 25],
    "itemsWithErrors": [100, 200, 350]
  },
  "itemComparisons": [
    // Note: Only contains items with differences or errors (67 items in this example)
    // Identical items (350 in this example) are excluded from this array
    {
      "itemId": 1,
      "itemName": "Example Item",
      "polygonSvgs": {
        "front": "<svg>...</svg>",
        "back": "<svg>...</svg>",
        "left": "<svg>...</svg>",
        "right": "<svg>...</svg>"
      },
      "baseSepoliaSvgs": {
        "front": "<svg>...</svg>",
        "back": "<svg>...</svg>",
        "left": "<svg>...</svg>",
        "right": "<svg>...</svg>"
      },
      "isIdentical": false,
      "differences": ["front", "left"],
      "error": null
    }
  ]
}
```

## Notes

- The script includes rate limiting between batches to be respectful to RPC endpoints
- Errors are handled gracefully and reported in the output
- The `getItemSvgs` function assumes the contract returns an array with [front, back, left, right] - adjust the indices if your contract returns them in a different order
