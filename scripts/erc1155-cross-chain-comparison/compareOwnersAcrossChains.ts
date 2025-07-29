import chalk from 'chalk';
import { CollectionConfig, ComparisonResult } from './lib/types';
import { fetchAllChainData } from './lib/fetchers';
import { compareOwnershipData } from './lib/comparison';
import { printResults } from './lib/printers';
import { getCollectionConfig, saveResults } from './lib/utils';

// Parse command line arguments
function parseArguments(): 'base' | 'basesepolia' | undefined {
  const args = process.argv.slice(2);
  const networkArg = args.find(arg => arg.startsWith('--network='));

  if (networkArg) {
    const network = networkArg.split('=')[1];
    if (network === 'base' || network === 'basesepolia') {
      return network;
    } else {
      console.error(
        chalk.red.bold(`❌ Invalid network: ${network}. Must be 'base' or 'basesepolia'`)
      );
      process.exit(1);
    }
  }

  // Check for standalone network arguments
  if (args.includes('--base')) return 'base';
  if (args.includes('--basesepolia')) return 'basesepolia';

  // Return undefined to use environment or default config
  return undefined;
}

const network = parseArguments();
const COLLECTION_CONFIG = getCollectionConfig(network);

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

    // Create contract addresses map
    const contractAddresses: { [chainName: string]: string } = {};
    activeChains.forEach(chain => {
      contractAddresses[chain.name] = chain.contractAddress;
    });

    // Compare the data
    const result = compareOwnershipData(chainData, COLLECTION_CONFIG.name, contractAddresses);

    // Print results
    printResults(result);

    if (result.discrepancies.length === 0) {
      console.log(chalk.green('\n✅ No discrepancies found - all data matches perfectly!'));
    } else {
      console.log(
        chalk.yellow(`\n⚠️  Found ${result.discrepancies.length} discrepancies - see results above`)
      );
    }

    // Save results
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
