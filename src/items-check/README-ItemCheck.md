# Aavegotchi Item Checker

This tool runs the item checking logic from `findGotchi.ts` across all items in the Aavegotchi ecosystem or a specific item ID, with rate-limiting protection.

## Purpose

The script checks each item for:

1. Whether the total supply (owner balances) matches the expected max quantity
2. Whether the number of Aavegotchis with the item equipped matches the expected diamond contract balance
3. Additional checks for potential discrepancies in the item distribution

## Rate Limiting Protection

The script includes batch processing to avoid hitting RPC rate limits:

- Items are processed in configurable batches
- A delay is added between each item check
- A longer delay is added between batches
- Configuration can be adjusted to optimize for different RPC providers

## Usage

### Check All Items

Run the script to check all items with default batch settings:

```bash
npx ts-node src/items-check/runItemsCheck.ts
```

### Check a Specific Item

Run the script for a specific item ID:

```bash
npx ts-node src/items-check/runItemsCheck.ts 11
```

Replace `11` with any valid item ID you want to check.

### Using the Shell Script with Options

For more control, use the shell script with options:

```bash
chmod +x src/items-check/runScript.sh
./src/items-check/runScript.sh -b 3 -d 8000 -t 2000
```

Available options:

- `-i, --item ITEM_ID`: Check a specific item ID
- `-b, --batch-size SIZE`: Set batch size (default: 5)
- `-d, --batch-delay MS`: Set delay between batches in ms (default: 5000)
- `-t, --item-delay MS`: Set delay between items in ms (default: 1000)
- `-h, --help`: Show help message

Examples:

```bash
# Check item ID 11 only
./src/items-check/runScript.sh -i 11

# Check all items with smaller batches and longer delays
./src/items-check/runScript.sh -b 3 -d 10000 -t 2000

# Show help
./src/items-check/runScript.sh -h
```

## Configuration

You can manually modify these settings in the script's CONFIG object:

```typescript
const CONFIG = {
  // Number of items to process in a batch before pausing
  BATCH_SIZE: 5,
  // Delay between items within a batch (in ms)
  ITEM_DELAY: 1000,
  // Delay between batches (in ms)
  BATCH_DELAY: 5000,
  // Output file path
  OUTPUT_FILE: './item-errors.json',
};
```

## Output

The script will:

1. Display progress information in the console
2. Create a file called `item-errors.json` with details about any items that failed the checks
3. Update the error file after each item check to prevent data loss

The error JSON file contains:

- Item ID
- Item name
- Max quantity
- Error type (which check failed)
- Error data (specific values that didn't match)
- Error message

## Environment Setup

Make sure you have the appropriate environment variables set in your `.env` file, particularly:

```
RPC_URL=your_ethereum_rpc_url
```

## Troubleshooting

If you encounter rate limiting or connection issues, consider:

1. Increasing the batch delay (`-d` option)
2. Decreasing the batch size (`-b` option)
3. Increasing the item delay (`-t` option)
4. Using a more reliable RPC provider
5. Running checks for specific item IDs rather than all at once
