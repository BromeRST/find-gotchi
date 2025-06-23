import {
  CollectionConfig,
  ComparisonResult,
  Owner,
  OwnerComparison,
  TransferAnalysis,
} from './types';
import dotenv from 'dotenv';
import { baseSepoliaAddresses } from './chainAddresses';
import { polygonAddresses } from './chainAddresses';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs/promises';
import { fetchTransfersForContract } from './fetchers';

// Load environment variables from .env file
dotenv.config();

// Configuration - Can be overridden by environment variables for multi-collection runs
export function getCollectionConfig(): CollectionConfig {
  // Check if running from multi-collection script (has environment variables set)
  if (
    process.env.COLLECTION_NAME &&
    process.env.POLYGON_CONTRACT &&
    process.env.BASE_SEPOLIA_CONTRACT
  ) {
    const config: CollectionConfig = {
      name: process.env.COLLECTION_NAME,
      apiKey: process.env.ALCHEMY_API_KEY || '',
      chains: [
        {
          name: 'Polygon',
          alchemyEndpoint: 'https://polygon-mainnet.g.alchemy.com/nft/v3',
          contractAddress: process.env.POLYGON_CONTRACT,
          maxRequests: 100,
          requestDelay: 100,
          enabled: true,
          blockNumber: process.env.POLYGON_BLOCK || undefined,
        },
        {
          name: 'BaseSepolia',
          alchemyEndpoint: 'https://base-sepolia.g.alchemy.com/nft/v3',
          contractAddress: process.env.BASE_SEPOLIA_CONTRACT,
          maxRequests: 100,
          requestDelay: 100,
          enabled: true,
          blockNumber: process.env.BASE_SEPOLIA_BLOCK || undefined,
        },
      ],
    };

    // Remove empty block numbers
    config.chains.forEach(chain => {
      if (chain.blockNumber === '') {
        delete chain.blockNumber;
      }
    });

    return config;
  }

  // Default configuration for single collection runs
  return {
    name: 'Installations',
    apiKey: process.env.ALCHEMY_API_KEY || '',
    chains: [
      {
        name: 'Polygon',
        alchemyEndpoint: 'https://polygon-mainnet.g.alchemy.com/nft/v3',
        contractAddress: polygonAddresses.installationsDiamond,
        maxRequests: 100,
        requestDelay: 100,
        enabled: true,
        blockNumber: '72386800',
      },
      {
        name: 'BaseSepolia',
        alchemyEndpoint: 'https://base-sepolia.g.alchemy.com/nft/v3',
        contractAddress: baseSepoliaAddresses.installationsDiamond,
        maxRequests: 100,
        requestDelay: 100,
        enabled: true,
      },
    ],
  };
}

export async function saveResults(result: ComparisonResult): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sanitizedCollectionName = result.collectionName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const filename = `${sanitizedCollectionName}-comparison-${timestamp}.json`;
  const filePath = path.join(process.cwd(), 'data/results/erc1155', filename);

  try {
    // Ensure data directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    await fs.writeFile(filePath, JSON.stringify(result, null, 2));
    console.log(chalk.green(`\n💾 Results saved to: ${filePath}`));
  } catch (error) {
    console.error(chalk.red('Failed to save results:'), error);
  }
}

export function adjustBalancesWithTransfers(
  polygonData: Owner[],
  transferAnalysis: TransferAnalysis[]
): { adjustedData: Owner[]; addressesToExclude: Set<string> } {
  console.log(chalk.cyan.bold('\n🔧 ADJUSTING POLYGON BALANCES WITH TRANSFER DATA'));
  console.log(chalk.blue('Applying post-snapshot transfers to Polygon balances...\n'));

  // Create a map of Polygon owners for easy access
  const polygonOwnerMap = new Map<string, Owner>();
  polygonData.forEach(owner => {
    polygonOwnerMap.set(owner.ownerAddress.toLowerCase(), {
      ...owner,
      tokenBalances: [...owner.tokenBalances], // Deep copy token balances
    });
  });

  let totalAdjustments = 0;
  const addressesToExclude = new Set<string>(); // Addresses that should be excluded from comparison

  // Apply transfers to adjust balances
  transferAnalysis.forEach(analysis => {
    if (analysis.relevantTransfers.length === 0) return;

    const ownerAddress = analysis.address.toLowerCase();
    const owner = polygonOwnerMap.get(ownerAddress);

    if (!owner) {
      console.log(chalk.yellow(`⚠️  Owner ${analysis.address} not found in Polygon data`));
      return;
    }

    console.log(chalk.blue(`📝 Adjusting balances for ${analysis.address}:`));

    // Group transfers by token ID and calculate net changes
    const tokenAdjustments = new Map<string, number>();

    analysis.relevantTransfers.forEach(transfer => {
      // tokenId is already in decimal format from the API
      const tokenIdDecimal = transfer.tokenId;
      const isReceived = transfer.to.toLowerCase() === ownerAddress;
      const transferAmount = transfer.transferAmount || 1;

      // Working backwards from current balance to snapshot balance:
      // Current Balance = Snapshot Balance + Net Transfers Since Snapshot
      // Therefore: Snapshot Balance = Current Balance - Net Transfers Since Snapshot
      // - If received post-snapshot: subtract received amount from current balance
      // - If sent post-snapshot: add sent amount to current balance
      const adjustment = isReceived ? -transferAmount : +transferAmount;

      if (!tokenAdjustments.has(tokenIdDecimal)) {
        tokenAdjustments.set(tokenIdDecimal, 0);
      }
      tokenAdjustments.set(tokenIdDecimal, tokenAdjustments.get(tokenIdDecimal)! + adjustment);
    });

    // Apply adjustments to owner's token balances
    tokenAdjustments.forEach((netChange, tokenId) => {
      if (netChange === 0) return; // No net change

      const tokenBalance = owner.tokenBalances.find(tb => tb.tokenId === tokenId);

      if (tokenBalance) {
        const originalBalance = Number(tokenBalance.balance); // Ensure it's a number
        const newBalance = Math.max(0, originalBalance + netChange); // Ensure non-negative
        tokenBalance.balance = newBalance;

        console.log(
          `  Token ${tokenId}: ${originalBalance} → ${newBalance} (${netChange >= 0 ? '+' : ''}${netChange}) [snapshot adjustment]`
        );
        totalAdjustments++;
      } else if (netChange > 0) {
        // Add new token if received and didn't exist before
        owner.tokenBalances.push({
          tokenId,
          balance: netChange,
        });
        console.log(
          `  Token ${tokenId}: 0 → ${netChange} (tokens received post-snapshot, adjusting to snapshot balance)`
        );
        totalAdjustments++;
      } else {
        // Token was received post-snapshot but didn't exist in original balance
        // This means the token balance should be 0 at snapshot time
        console.log(
          `  Token ${tokenId}: 0 → 0 (tokens were received post-snapshot, snapshot balance was 0)`
        );
      }
    });

    // Remove tokens with zero balance
    owner.tokenBalances = owner.tokenBalances.filter(tb => tb.balance > 0);

    // Check if this owner should be excluded from comparison
    // Calculate what the balance would have been at snapshot time
    const originalOwner = polygonData.find(
      o => o.ownerAddress.toLowerCase() === analysis.address.toLowerCase()
    );

    if (originalOwner) {
      // Check if all current tokens came from post-snapshot transfers
      let snapshotBalance = 0;
      let currentBalance = 0;

      // Calculate original snapshot balance (before adjustments)
      originalOwner.tokenBalances.forEach(tb => {
        snapshotBalance += Number(tb.balance);
      });

      // Calculate current balance (after adjustments)
      owner.tokenBalances.forEach(tb => {
        currentBalance += Number(tb.balance);
      });

      // Calculate net transfers received
      let netReceived = 0;
      tokenAdjustments.forEach(netChange => {
        if (netChange > 0) {
          netReceived += netChange;
        }
      });

      // If the address would have had zero balance at snapshot time
      // but now has balance only due to post-snapshot transfers, exclude it
      const wouldHaveZeroAtSnapshot = snapshotBalance - netReceived <= 0;

      if (wouldHaveZeroAtSnapshot && netReceived > 0) {
        addressesToExclude.add(analysis.address.toLowerCase());
        console.log(
          chalk.yellow(
            `  🚫 Excluding ${analysis.address} from comparison (balance only exists due to post-snapshot transfers)`
          )
        );
      }
    }
  });

  console.log(chalk.green(`\n✅ Applied ${totalAdjustments} balance adjustments`));
  if (addressesToExclude.size > 0) {
    console.log(
      chalk.yellow(
        `🚫 Excluding ${addressesToExclude.size} addresses that only have post-snapshot tokens`
      )
    );
  }

  return {
    adjustedData: Array.from(polygonOwnerMap.values()),
    addressesToExclude,
  };
}

export async function analyzeTransfersForDiscrepancies(
  discrepancies: OwnerComparison[],
  contractAddress: string,
  blockNumber: string,
  apiKey: string,
  collectionName: string
): Promise<TransferAnalysis[]> {
  console.log(chalk.cyan.bold('\n🔍 ANALYZING TRANSFER ACTIVITY FOR DISCREPANCIES'));
  console.log(chalk.blue(`📦 Collection: ${collectionName}`));
  console.log(chalk.blue(`🏗️  Contract: ${contractAddress}`));
  console.log(chalk.blue(`📊 Block reference: ${blockNumber}`));
  console.log(chalk.blue(`🔢 Addresses to analyze: ${discrepancies.length}`));

  const results: TransferAnalysis[] = [];
  const maxRequests = 50; // Limit to avoid rate limiting
  const requestDelay = 200; // ms between requests

  // Convert block number to hex if it's decimal
  const blockHex = blockNumber.startsWith('0x')
    ? blockNumber
    : `0x${parseInt(blockNumber).toString(16)}`;

  // Analyze transfers from snapshot block to current block
  const fromBlock = blockHex;
  const toBlock = 'latest';

  console.log(
    chalk.gray(`\nAnalyzing transfers from block ${blockNumber} (${blockHex}) to latest...\n`)
  );

  for (let i = 0; i < Math.min(discrepancies.length, maxRequests); i++) {
    const owner = discrepancies[i];
    const address = owner.ownerAddress;

    console.log(
      chalk.yellow(
        `[${i + 1}/${Math.min(discrepancies.length, maxRequests)}] Checking transfers for ${address}...`
      )
    );

    try {
      // Fetch all transfers for this contract in the time range
      const allTransfers = await fetchTransfersForContract({
        contractAddress,
        fromBlock,
        toBlock,
        apiKey,
      });

      // Filter transfers that involve this address (either as sender or receiver)
      const addressTransfers = allTransfers.filter(
        transfer =>
          transfer.from.toLowerCase() === address.toLowerCase() ||
          transfer.to.toLowerCase() === address.toLowerCase()
      );

      // Filter for relevant token IDs (those with discrepancies)
      const relevantTokenIds = new Set(
        owner.discrepancies.tokenBalanceDiffs.map(diff => diff.tokenId)
      );

      const relevantTransfers = addressTransfers.filter(transfer => {
        // tokenId is already in decimal format from the API
        const transferTokenId = transfer.tokenId;
        return relevantTokenIds.has(transferTokenId);
      });

      results.push({
        address,
        transfersFound: addressTransfers.length,
        relevantTransfers,
        blockRange: { from: fromBlock, to: toBlock },
      });

      if (relevantTransfers.length > 0) {
        console.log(
          chalk.green(
            `  ✓ Found ${relevantTransfers.length} relevant transfers out of ${addressTransfers.length} total for this address`
          )
        );

        // Log details of relevant transfers
        relevantTransfers.forEach(transfer => {
          const direction =
            transfer.to.toLowerCase() === address.toLowerCase() ? 'RECEIVED' : 'SENT';
          // blockNumber and tokenId are already in decimal format from the API
          const blockNum = transfer.blockNumber;

          console.log(
            chalk.gray(
              `    ${direction} in block ${blockNum}: ${transfer.transferAmount || 1}x Token ${transfer.tokenId} ${direction === 'RECEIVED' ? 'from' : 'to'} ${direction === 'RECEIVED' ? transfer.from : transfer.to}`
            )
          );
        });
      } else {
        console.log(
          chalk.gray(
            `  - No relevant transfers found (${addressTransfers.length} total transfers for this address)`
          )
        );
      }

      // Rate limiting
      if (i < Math.min(discrepancies.length, maxRequests) - 1) {
        await new Promise(resolve => setTimeout(resolve, requestDelay));
      }
    } catch (error) {
      console.error(chalk.red(`  ❌ Error fetching transfers for ${address}:`), error);
      results.push({
        address,
        transfersFound: 0,
        relevantTransfers: [],
        blockRange: { from: fromBlock, to: toBlock },
      });
    }
  }

  if (discrepancies.length > maxRequests) {
    console.log(
      chalk.yellow(`\n⚠️  Limited analysis to first ${maxRequests} addresses due to rate limiting`)
    );
  }

  return results;
}
