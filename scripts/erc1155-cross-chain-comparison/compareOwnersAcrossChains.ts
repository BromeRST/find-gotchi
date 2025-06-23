import chalk from 'chalk';
import { CollectionConfig, ComparisonResult } from './types';
import { fetchAllChainData } from './lib/fetchers';
import { compareAdjustedBalances, compareOwnershipData } from './lib/comparison';
import { printResults, printTransferAnalysis } from './lib/printers';
import {
  adjustBalancesWithTransfers,
  analyzeTransfersForDiscrepancies,
  getCollectionConfig,
  saveResults,
} from './lib/utils';

const COLLECTION_CONFIG = getCollectionConfig();

async function main(): Promise<void> {
  try {
    console.log(chalk.cyan.bold('🚀 Starting ERC1155 Cross-Chain Comparison\n'));

    // Validate configuration
    if (!COLLECTION_CONFIG.apiKey) {
      throw new Error('ALCHEMY_API_KEY is required. Please set it in your environment variables.');
    }

    const activeChains = COLLECTION_CONFIG.chains.filter(config => config.enabled);

    if (activeChains.length < 2) {
      throw new Error('At least 2 enabled chains are required for comparison');
    }

    console.log(chalk.blue(`📦 Collection: ${chalk.bold(COLLECTION_CONFIG.name)}`));
    console.log(
      chalk.blue(
        `🔗 Comparing across ${activeChains.length} chains: ${activeChains.map(c => c.name).join(', ')}\n`
      )
    );

    // Display contract addresses and block numbers
    console.log(chalk.gray('📍 Contract addresses:'));
    activeChains.forEach(chain => {
      const blockInfo = chain.blockNumber ? ` (block: ${chain.blockNumber})` : ' (latest block)';
      console.log(`  ${chain.name}: ${chain.contractAddress}${blockInfo}`);
    });
    console.log();

    // Fetch data from all chains
    const chainData = await fetchAllChainData(COLLECTION_CONFIG);

    // Compare the data
    const result = compareOwnershipData(chainData, COLLECTION_CONFIG.name);

    // Print results
    printResults(result);

    // Analyze transfers for discrepancies (only if we have discrepancies and a Polygon block number)
    if (result.discrepancies.length > 0) {
      const polygonChain = COLLECTION_CONFIG.chains.find(chain => chain.name === 'Polygon');
      if (polygonChain && polygonChain.blockNumber) {
        console.log(chalk.cyan('\n🔍 Starting transfer analysis for discrepancies...'));
        const transferAnalysis = await analyzeTransfersForDiscrepancies(
          result.discrepancies,
          polygonChain.contractAddress,
          polygonChain.blockNumber,
          COLLECTION_CONFIG.apiKey,
          COLLECTION_CONFIG.name
        );
        printTransferAnalysis(transferAnalysis, COLLECTION_CONFIG.name);

        // Add transfer analysis to results before saving
        result.transferAnalysis = transferAnalysis;

        // Apply transfer adjustments and compare adjusted balances
        if (transferAnalysis.some(analysis => analysis.relevantTransfers.length > 0)) {
          const { adjustedData: adjustedPolygonData, addressesToExclude } =
            adjustBalancesWithTransfers(chainData['Polygon'], transferAnalysis);

          const adjustedResult = compareAdjustedBalances(
            result,
            adjustedPolygonData,
            chainData['BaseSepolia'],
            COLLECTION_CONFIG.name,
            addressesToExclude
          );

          // Print adjusted results if there are still discrepancies
          if (adjustedResult.discrepancies.length > 0) {
            console.log(chalk.red.bold('\n📋 REMAINING DISCREPANCIES AFTER ADJUSTMENT:'));
            printResults(adjustedResult);
          }

          // Add adjusted comparison to results
          result.adjustedComparison = adjustedResult;
        } else {
          console.log(
            chalk.yellow('\n⚠️  No relevant transfers found - skipping balance adjustment')
          );
        }
      } else {
        console.log(
          chalk.yellow('\n⚠️  Skipping transfer analysis: No Polygon block number specified')
        );
      }
    } else {
      console.log(chalk.green('\n✅ No discrepancies found - skipping transfer analysis'));
    }

    // Save results (including transfer analysis if performed)
    await saveResults(result);

    console.log(chalk.green.bold('\n✨ Comparison completed successfully!'));
  } catch (error) {
    console.error(chalk.red.bold('\n❌ Error during comparison:'), error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

export { main, compareOwnershipData, CollectionConfig, ComparisonResult };
