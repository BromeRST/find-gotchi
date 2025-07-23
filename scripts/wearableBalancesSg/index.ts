import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { baseSepoliaAddresses } from '../erc1155-cross-chain-comparison/lib/chainAddresses';
import type { Config, ItemAnalysis } from './lib/types';
import { fetchOwnersFromSubgraph, fetchOnChainBalances, discoverItemIds } from './lib/fetchers';
import {
  compareBalances,
  generateComparisonResult,
  printComparisonSummary,
} from './lib/comparison';

dotenv.config();

const BASE_SEPOLIA_SG_ENDPOINT = `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-baseSepolia/version/baseSepolia-test-mints-33/api`;

function validateEnvironment(): void {
  if (!process.env.SUBGRAPH_KEY) {
    throw new Error('SUBGRAPH_KEY environment variable is required');
  }

  if (!process.env.BASE_SEPOLIA_RPC_URL) {
    throw new Error('BASE_SEPOLIA_RPC_URL environment variable is required');
  }
}

function getConfig(): Config {
  return {
    subgraphEndpoint: BASE_SEPOLIA_SG_ENDPOINT,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL!,
    contractAddress: baseSepoliaAddresses.wearableDiamond,
    blockNumber: undefined, // Use latest block
    batchSize: 50, // Batch size for contract calls
    maxItemId: 1000, // Maximum item ID to check
    requestDelay: 250, // Delay between requests in ms
    maxRetries: 3, // Maximum retries for failed requests
  };
}

async function processItem(config: Config, itemId: string): Promise<ItemAnalysis> {
  console.log(chalk.cyan(`Processing item ${itemId}...`));

  // Fetch subgraph owners
  const subgraphOwners = await fetchOwnersFromSubgraph(config, itemId);

  // Get all unique addresses for on-chain verification
  const addresses = Array.from(new Set(subgraphOwners.map(owner => owner.owner.toLowerCase())));

  // Fetch on-chain balances for all addresses
  const onChainBalances = await fetchOnChainBalances(config, itemId, addresses);

  // Compare the data
  const analysis = compareBalances(itemId, subgraphOwners, onChainBalances);

  return analysis;
}

async function saveResults(result: any, filename: string): Promise<void> {
  const resultsDir = path.join(__dirname, 'results');
  try {
    await fs.mkdir(resultsDir, { recursive: true });
    const filePath = path.join(resultsDir, filename);
    await fs.writeFile(filePath, JSON.stringify(result, null, 2));
    console.log(chalk.green(`Results saved to: ${filePath}`));
  } catch (error) {
    console.error(chalk.red(`Failed to save results: ${error}`));
  }
}

async function main(): Promise<void> {
  console.log(chalk.bold.blue('Starting Wearable Balance Comparison (Base Sepolia)'));
  console.log('='.repeat(60));

  try {
    validateEnvironment();
    const config = getConfig();

    console.log(chalk.blue('Configuration:'));
    console.log(`- Subgraph: ${config.subgraphEndpoint}`);
    console.log(`- RPC URL: ${config.rpcUrl}`);
    console.log(`- Contract: ${config.contractAddress}`);
    console.log(`- Block Number: ${config.blockNumber || 'latest'}`);
    console.log(`- Max Item ID: ${config.maxItemId}`);
    console.log('');

    // Discover available item IDs
    const itemIds = await discoverItemIds(config);

    if (itemIds.length === 0) {
      console.log(chalk.yellow('No items found with owners. Exiting.'));
      return;
    }

    console.log(chalk.green(`Found ${itemIds.length} items to analyze`));
    console.log('');

    // Process each item
    const itemAnalyses: ItemAnalysis[] = [];

    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      console.log(chalk.bold(`[${i + 1}/${itemIds.length}] Processing item ${itemId}`));

      try {
        const analysis = await processItem(config, itemId);
        itemAnalyses.push(analysis);
      } catch (error) {
        console.error(chalk.red(`Failed to process item ${itemId}: ${error}`));
      }

      // Add delay between items to avoid rate limiting
      if (i < itemIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, config.requestDelay));
      }
    }

    // Generate final comparison result
    const comparisonResult = generateComparisonResult(itemAnalyses);

    // Print summary
    printComparisonSummary(comparisonResult);

    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await saveResults(comparisonResult, `wearable-balance-comparison-${timestamp}.json`);

    // Save detailed results for items with discrepancies
    const itemsWithDiscrepancies = itemAnalyses.filter(item => !item.balancesMatch);
    if (itemsWithDiscrepancies.length > 0) {
      await saveResults(itemsWithDiscrepancies, `wearable-balance-discrepancies-${timestamp}.json`);
      console.log(
        chalk.yellow(`Detailed discrepancies saved for ${itemsWithDiscrepancies.length} items`)
      );
    }

    console.log(chalk.bold.green('Comparison completed successfully!'));
  } catch (error) {
    console.error(chalk.red('Fatal error:', error));
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\nReceived SIGINT. Gracefully shutting down...'));
  process.exit(0);
});

if (require.main === module) {
  main();
}
