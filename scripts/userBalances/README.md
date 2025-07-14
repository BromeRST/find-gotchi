# User Balance Comparison Script

This script performs comprehensive comparison of user balances between two different subgraphs with advanced ownership resolution capabilities.

## Features

### Core Comparison

- Fetches all users from both subgraphs in batches of 1000
- Compares the following user data:
  - `gotchisOriginalOwned` - Aavegotchi tokens with original ownership resolution
  - `portalsOwned` - Unopened portal tokens only
  - `parcelsOwned` - REALM parcel tokens with parcelHash data
  - `fakeGotchiCardBalances` - FakeGotchi card balances with value comparison
  - `fakeGotchiNFTTokens` - FakeGotchi NFT tokens

### Advanced Ownership Resolution

- **Vault Processing**: Resolves real owners of gotchis stored in vaults via on-chain calls
- **Lending Processing**: Updates original ownership for gotchis that are currently lent out
- **Cross-Chain Integration**: Updates Polygon gotchi ownership based on Ethereum subgraph data
- **Contract Exclusion**: Automatically excludes known contract addresses from comparison

### Data Processing

- Filters out users with zero balances across all categories
- Identifies users that exist only in one subgraph
- Detects differences in balances, values, and ownership
- Provides detailed statistics on filtered vs. unfiltered data
- Supports multiple query types (gotchis, portals, parcels, fakeGotchi)

### Output & Logging

- Exports results to timestamped JSON files with query-type prefixes
- Comprehensive progress logging with colored output using **chalk** and emoji
- Detailed metadata including block numbers, user counts, and processing statistics
- Error handling with retry logic and rate limiting support

## Folder Structure

The logic is modularized across several files in the `lib` folder:

- `lib/types.ts` - TypeScript interfaces and type definitions
- `lib/queries.ts` - GraphQL query strings for different data types
- `lib/fetchers.ts` - Data retrieval helpers for subgraphs and blockchain
- `lib/compare.ts` - Comparison utilities and filtering logic
- `lib/owners.ts` - Advanced ownership resolution (vault, lending, cross-chain)
- `lib/utils.ts` - Shared utilities including retry logic and delays
- `lib/logger.ts` - Colored logging helpers
- `lib/vaultAbi.ts` - Vault contract ABI for on-chain owner resolution

## Usage

### Environment Variables

Set the following environment variables before running the script:

```bash
export SUBGRAPH_KEY="your-satsuma-subgraph-key"
export POLYGON_RPC_URL="your-polygon-rpc-endpoint"  # Required for vault processing
```

### Configuration

The script uses a hardcoded configuration object that can be modified:

```typescript
const config = {
  subgraph1Url: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-matic/api`,
  subgraph2Url: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-baseSepolia/version/baseSepolia-test-mints-33/api`,
  blockNumber1: 73121283, // Polygon block number
  blockNumber2: 27634438, // Base Sepolia block number
  batchSize: 1000,
};
```

### Query Types

Choose which data to compare by setting the `queryToUse` variable:

- `gotchiQuery` - Compare gotchi ownership (includes advanced processing)
- `portalQuery` - Compare portal ownership (unopened only)
- `parcelQuery` - Compare parcel ownership
- `fakegotchiQuery` - Compare FakeGotchi NFT tokens

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
export POLYGON_RPC_URL="https://polygon-mainnet.infura.io/v3/your-key"

yarn compare-user-balances
```

## Advanced Processing

### Gotchi Ownership Resolution (gotchiQuery only)

When comparing gotchis, the script performs additional processing:

1. **Lending Resolution**: Fetches active gotchi lendings and updates ownership to reflect lenders as original owners
2. **Vault Resolution**: Makes on-chain calls to resolve real owners of gotchis stored in vaults
3. **Ethereum Integration**: Fetches Ethereum gotchi ownership data to update Polygon original owners

### Filtering & Exclusions

- **Contract Exclusion**: Removes known contract addresses from comparison
- **Balance Filtering**: Excludes users with zero balances across all categories
- **Statistics**: Provides detailed counts of filtered vs. unfiltered users

## Output

Results are saved to `data/results/users/` with the following naming convention:
`{query-type}-comparison-{YYYY-MM-DD}.json`

Example output structure:

```json
{
  "metadata": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "subgraph1Url": "...",
    "subgraph2Url": "...",
    "blockNumber1": 73121283,
    "blockNumber2": 27634438,
    "totalUsersSubgraph1": 15000,
    "usersWithBalancesSubgraph1": 12000,
    "usersWithoutBalancesSubgraph1": 3000,
    "totalUsersSubgraph2": 8000,
    "usersWithBalancesSubgraph2": 7500,
    "usersWithoutBalancesSubgraph2": 500,
    "totalUniqueUsers": 18000,
    "usersWithDifferences": 150,
    "usersOnlyInSubgraph1Count": 50,
    "usersOnlyInSubgraph2Count": 25,
    "totalIdsSubgraph1": 25000,
    "totalIdsSubgraph2": 12000
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

## Error Handling & Performance

- **Retry Logic**: Automatic retry with exponential backoff for rate-limited requests
- **Batch Processing**: Processes blockchain calls in batches with delays to avoid rate limits
- **Error Context**: Detailed error logging with context for debugging
- **Memory Efficient**: Uses Maps for large datasets and streaming processing
- **Progress Tracking**: Real-time progress updates for long-running operations

## Dependencies

- **ethers.js**: For blockchain interactions and vault owner resolution
- **graphql-request**: For subgraph data fetching
- **chalk**: For colored console output
- **dotenv**: For environment variable management

## Notes

- Vault processing requires a Polygon RPC endpoint and may take significant time for large datasets
- Cross-chain processing fetches data from Ethereum subgraph automatically
- The script automatically handles rate limiting and network timeouts
- Block numbers in configuration should be updated to match desired comparison points
