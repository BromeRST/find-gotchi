# On-Chain Aavegotchi Comparison

This script compares Aavegotchi data between Polygon and Base Sepolia chains by making direct contract calls. It uses `getAavegotchi` for single token comparisons and `batchGetBridgedAavegotchi` for efficient batch processing.

## Overview

The script fetches the same token ID from both chains and compares all metadata fields to identify discrepancies. This is useful for:

- Verifying cross-chain consistency
- Identifying migration issues
- Debugging contract differences

**Important**: The script fetches Polygon data at a specific historical block number (73121283) to ensure consistent comparison against the current state of Base Sepolia. This provides a snapshot comparison rather than real-time data.

## Dual Processing Approach

The script uses two different contract functions depending on the processing mode:

### Single Token Mode

- Uses `getAavegotchi(uint256 _tokenId)` function
- Returns complete `AavegotchiInfo` struct with all metadata
- Ideal for detailed single token analysis

### Batch Processing Mode

- Uses `batchGetBridgedAavegotchi(uint256[] _tokenIds)` function
- Returns array of `AavegotchiBridged` structs (streamlined format)
- **50x more efficient**: 2 RPC calls per batch vs 100 calls (50 tokens × 2 chains)
- Processes 50 tokens simultaneously instead of sequentially

**Performance Improvement**: Batch mode reduces RPC calls from 100 per batch to just 2 per batch, making full processing significantly faster and more reliable.

## Setup

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
POLYGON_RPC_URL=https://your-polygon-rpc-url
BASE_SEPOLIA_RPC_URL=https://your-base-sepolia-rpc-url
```

### Required Dependencies

The script uses the following dependencies (already included in package.json):

- `ethers` - For blockchain interactions
- `chalk` - For colored console output
- `dotenv` - For environment variable management

## Usage

### Command Line

```bash
# Run the comparison for a specific token ID
npm run compare-onchain-gotchi <tokenId>

# Example - single token
npm run compare-onchain-gotchi 1234

# Run batch comparison for ALL tokens (0-25000)
npm run compare-onchain-gotchi-all
# OR
npm run compare-onchain-gotchi all
# OR
npm run compare-onchain-gotchi --all
```

### Programmatic Usage

```typescript
import { compareOnChainGotchi } from './scripts/onChainGotchiComparison';

async function example() {
  const result = await compareOnChainGotchi('1234');
  console.log('Comparison result:', result);
}
```

## Batch Processing

The script supports two modes:

### Single Token Mode

Compares a specific token ID between chains.

### Batch Mode (All Tokens)

Processes all Aavegotchi IDs from 0 to 25,000 using `batchGetBridgedAavegotchi` for maximum efficiency:

- **Batch Contract Calls**: Uses `batchGetBridgedAavegotchi` to fetch 50 tokens per call
- **High Efficiency**: 50x reduction in RPC calls compared to individual requests
- **Retry Logic**: Automatic retry with exponential backoff for failed batch requests
- **Rate Limiting**: Configurable delays between batches (much faster than individual delays)
- **Progress Tracking**: Real-time batch processing updates and statistics
- **Comprehensive Results**: All results saved in a single file for complete analysis
- **Error Handling**: Graceful handling of individual token and batch failures
- **Final Summary**: Comprehensive report of all processing

### Configuration

- **Batch Size**: 50 tokens per batch (configurable)
- **Batch Function**: `batchGetBridgedAavegotchi` for efficient parallel processing
- **Batch Delay**: 2 seconds between batches (much faster than individual requests)
- **Max Retries**: 3 attempts per batch request
- **Retry Delay**: Exponential backoff starting at 1 second

**Performance Note**: With batch processing, a full scan of 25,001 tokens requires only ~502 RPC calls (251 batches × 2 chains) instead of 50,002 individual calls, dramatically reducing processing time.

### JSON Output Format

The output JSON file contains only tokens with discrepancies or errors, making it much more concise:

```json
{
  "Comparison Summary": {
    "Timestamp": "2024-01-15T10:30:00.000Z",
    "Total Processed": 25001,
    "Processing Time": "120s",
    "Polygon Block Number": 73121283,
    "Overall Statistics": {
      "Identical": 24800,
      "Different": 150,
      "Errors": 51,
      "Missing on Polygon": 25,
      "Missing on Base Sepolia": 26
    }
  },
  "Token Discrepancies": [
    {
      "Token ID": "1234",
      "Is Identical": false,
      "Error": null,
      "Discrepancies Count": 2,
      "Discrepancies": [
        {
          "1. Field": "owner",
          "Type": "value_mismatch",
          "Polygon Value": "0x1234...",
          "Base Sepolia Value": "0x5678..."
        },
        {
          "2. Field": "kinship",
          "Type": "value_mismatch",
          "Polygon Value": "50",
          "Base Sepolia Value": "75"
        }
      ]
    }
  ]
}
```

This format focuses on problematic tokens only, making analysis much easier and files significantly smaller.

## Output

The script provides different outputs based on mode:

### Single Token Mode

1. **Console Output**: Colored comparison results showing:

   - Basic configuration information
   - Fetch status for each chain
   - Detailed discrepancy list
   - Summary data for both chains

2. **JSON File**: Detailed results saved to `scripts/onChainGotchiComparison/results/comparison_{tokenId}_{date}.json`

### Batch Mode

1. **Console Output**:

   - Configuration and progress information
   - Real-time batch processing updates
   - Final summary statistics
   - Count of tokens with discrepancies

2. **Single Complete File**: Discrepancies and summary saved as `complete_comparison_{date}.json` containing:
   - Overall summary and statistics
   - **Only tokens with discrepancies or errors** (not all 25,001 tokens)
   - Detailed discrepancy information for each problematic token

## Comparison Fields

The script compares Aavegotchi metadata fields. The available fields depend on the processing mode:

### Single Token Mode (Complete Data)

Compares all fields from the full `AavegotchiInfo` struct.

### Batch Mode (Bridged Data)

Compares core fields from the `AavegotchiBridged` struct. Some fields like `kinship`, `level`, `baseRarityScore`, and `stakedAmount` are not available in the bridged format and are set to default values.

### Available Comparison Fields

### Basic Fields

- `tokenId` - The token identifier
- `name` - Aavegotchi name
- `owner` - Current owner address
- `randomNumber` - Random seed used for traits
- `status` - Current status (portal, opened, claimed, etc.)
- `collateral` - Collateral token address
- `escrow` - Escrow contract address
- `stakedAmount` - Amount of collateral staked
- `minimumStake` - Minimum required stake
- `kinship` - Kinship level
- `lastInteracted` - Last interaction timestamp
- `experience` - Experience points
- `toNextLevel` - XP needed for next level
- `usedSkillPoints` - Skill points spent
- `level` - Current level
- `hauntId` - Haunt identifier
- `baseRarityScore` - Base rarity score
- `modifiedRarityScore` - Modified rarity score (with wearables)
- `locked` - Whether the Aavegotchi is locked

### Array Fields

- `numericTraits[6]` - Base numeric traits
- `modifiedNumericTraits[6]` - Modified traits (with wearables)
- `equippedWearables[16]` - Equipped wearable IDs

### Complex Fields

- `items` - Array of equipped items with full metadata

## Contract Addresses

The script uses contract addresses from `chainAddresses.ts`:

- **Polygon**: `polygonAddresses.aavegotchiDiamond`
- **Base Sepolia**: `baseSepoliaAddresses.aavegotchiDiamond`

## Historical Comparison

The script performs historical comparison by:

- **Polygon**: Fetches data at block number 73121283 (fixed historical snapshot)
- **Base Sepolia**: Fetches current state data

This approach ensures consistent comparison between a specific point in time on Polygon and the current state on Base Sepolia, which is useful for:

- Verifying migration accuracy
- Comparing states before and after cross-chain transfers
- Analyzing historical data consistency

## Error Handling

The script handles various error scenarios:

- Network connectivity issues
- Token not found on one or both chains
- Contract call failures
- Invalid token IDs

## Example Output

```
🔧 Configuration:
   Polygon RPC: https://polygon-rpc.com
   Base Sepolia RPC: https://sepolia.base.org
   Polygon Contract: 0x86935F11C86623deC8a25696E1C19a8659CbF95d
   Base Sepolia Contract: 0x03A74B3e2DD81F5E8FFA1Fb96bb81B35cF3ed5d2
   Polygon Block Number: 73121283

🚀 Starting on-chain comparison for Token ID: 1234
📡 Fetching data from Polygon at block 73121283...
✓ Polygon data fetched successfully
📡 Fetching data from Base Sepolia (current state)...
✓ Base Sepolia data fetched successfully

🔍 Comparison Results for Token ID: 1234
============================================================

⚠️  Found 2 discrepancies:

1. Field: owner
   Type: value_mismatch
   Polygon: "0x1234..."
   Base Sepolia: "0x5678..."

2. Field: kinship
   Type: value_mismatch
   Polygon: "50"
   Base Sepolia: "75"

📊 Polygon Data:
   Name: TestGotchi
   Owner: 0x1234...
   Level: 1
   Kinship: 50
   Base Rarity Score: 300

📊 Base Sepolia Data:
   Name: TestGotchi
   Owner: 0x5678...
   Level: 1
   Kinship: 75
   Base Rarity Score: 300
```

## Customization

To modify which fields are compared, edit the `fieldsToCompare` and `arrayFieldsToCompare` arrays in the script. You can also enhance the items comparison logic for more detailed item-level comparisons.
