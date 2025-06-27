# User Balance Comparison Script

This script compares user balances between two different subgraphs to identify discrepancies.

## Features

- Fetches all users from both subgraphs in batches of 1000
- Compares the following user data:
  - `gotchisOriginalOwned`

  - `portalsOwned` (unopened only)
  - `parcelsOwned`
  - `fakeGotchiCardBalances`
  - `fakeGotchiNFTTokens`
- Identifies users that exist only in one subgraph
- Detects differences in balances and values
- Exports results to a JSON file
- Prints progress logs for each batch of requests
- Uses **chalk** and emoji to colorize output for better readability

## Folder Structure

The logic is split into several modules under a `lib` directory:
- `compareUserBalances.ts` - main entry point.
- `lib/types.ts` - TypeScript interfaces.
- `lib/queries.ts` - GraphQL query strings.
- `lib/fetchers.ts` - data retrieval helpers.
- `lib/compare.ts` - comparison utilities.
- `lib/owners.ts` - functions for resolving original owners.
- `lib/utils.ts` - shared helpers.
- `lib/logger.ts` - simple colored logging helpers.
- `lib/vaultAbi.ts` - ABI used by owner resolution utilities.

## Usage

### Environment Variables

Set the following environment variables before running the script:

```bash
export SUBGRAPH_KEY="your-satsuma-subgraph-key"
export BLOCK_NUMBER_1="123456789"  # Optional: specific block number for subgraph 1
export BLOCK_NUMBER_2="987654321"  # Optional: specific block number for subgraph 2
```

### Running the Script

```bash
# Using yarn
yarn compare-user-balances

# Or directly with ts-node
ts-node scripts/userBalances/compareUserBalances.ts
```

### Example

```bash
export SUBGRAPH_KEY="your-satsuma-subgraph-key"
export BLOCK_NUMBER_1="12345678"  # Block number for aavegotchi-core-matic
export BLOCK_NUMBER_2="87654321"  # Block number for aavegotchi-core-baseSepolia

yarn compare-user-balances
```

## Output

The script creates a JSON file at `data/results/user-balance-comparison.json` with the following structure:

```json
{
  "metadata": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "subgraph1Url": "...",
    "subgraph2Url": "...",
    "blockNumber1": 123456789,
    "blockNumber2": 987654321,
    "totalUsersSubgraph1": 1000,
    "totalUsersSubgraph2": 1000,
    "totalUniqueUsers": 1000,
    "usersWithDifferences": 50,
    "usersOnlyInSubgraph1Count": 10,
    "usersOnlyInSubgraph2Count": 5
  },
  "usersOnlyInSubgraph1": ["0x123...", "0x456..."],
  "usersOnlyInSubgraph2": ["0x789..."],
  "differences": [
    {
      "userId": "0xabc...",
      "differences": {
        "gotchisOriginalOwned": {
          "subgraph1Count": 5,
          "subgraph2Count": 3,
          "onlyInSubgraph1": ["12345", "67890"],
          "onlyInSubgraph2": []
        },
        "fakeGotchiCardBalances": {
          "subgraph1Count": 10,
          "subgraph2Count": 10,
          "onlyInSubgraph1": [],
          "onlyInSubgraph2": [],
          "valueDifferences": [
            {
              "id": "card123",
              "subgraph1Value": "100",
              "subgraph2Value": "95"
            }
          ]
        }
      }
    }
  ]
}
```

## Configuration

You can modify the batch size by changing the `batchSize` value in the config object within the script (default: 1000).

## Error Handling

- The script will retry failed requests and provide detailed error messages
- If either subgraph URL is missing, the script will exit with an error
- Network timeouts and GraphQL errors are logged with context
