import { spawn } from 'child_process';
import path from 'path';
import chalk from 'chalk';
import { baseAddresses, baseSepoliaAddresses, polygonAddresses } from './lib/chainAddresses';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Define all ERC1155 collections to compare
interface CollectionDefinition {
  name: string;
  baseAddress: string;
  baseSepoliaAddress: string;
  polygonAddress: string;
  blockNumber?: {
    base?: string;
    basesepolia?: string;
    polygon?: string;
  };
}

const COLLECTIONS: CollectionDefinition[] = [
  {
    name: 'Installations',
    baseAddress: baseAddresses.installationDiamond,
    baseSepoliaAddress: baseSepoliaAddresses.installationDiamond,
    polygonAddress: polygonAddresses.installationDiamond,
    blockNumber: {
      polygon: '73121283', // You can set specific block numbers for each collection
      // base: '12345678', // Uncomment and set if needed
      // basesepolia: '12345678', // Uncomment and set if needed
    },
  },
  {
    name: 'Tiles',
    baseAddress: baseAddresses.tilesDiamond,
    baseSepoliaAddress: baseSepoliaAddresses.tileDiamond,
    polygonAddress: polygonAddresses.tilesDiamond,
    blockNumber: {
      polygon: '73121283', // You can set specific block numbers for each collection
      // base: '12345678', // Uncomment and set if needed
      // basesepolia: '12345678', // Uncomment and set if needed
    },
  },
  // {
  //   name: 'FakeCards',
  //   baseAddress: baseAddresses.fakeCardsDiamond,
  //   baseSepoliaAddress: baseSepoliaAddresses.fakeCardsDiamond,
  //   polygonAddress: polygonAddresses.fakeCardsDiamond,
  //   blockNumber: {
  //     polygon: '74262598', // You can set specific block numbers for each collection
  //     // base: '12345678', // Uncomment and set if needed
  //     // basesepolia: '12345678', // Uncomment and set if needed
  //   },
  // },
  // {
  //   name: 'Forge',
  //   baseAddress: baseAddresses.forgeDiamond,
  //   baseSepoliaAddress: baseSepoliaAddresses.forgeDiamond,
  //   polygonAddress: polygonAddresses.forgeDiamond,
  //   blockNumber: {
  //     polygon: '74262598', // You can set specific block numbers for each collection
  //     // base: '12345678', // Uncomment and set if needed
  //     // basesepolia: '12345678', // Uncomment and set if needed
  //   },
  // },
];

// Function to run comparison for a single collection
function runCollectionComparison(
  collection: CollectionDefinition,
  network: 'base' | 'basesepolia'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const networkName = network === 'basesepolia' ? 'Base Sepolia' : 'Base';
    const networkAddress =
      network === 'basesepolia' ? collection.baseSepoliaAddress : collection.baseAddress;
    const networkBlockNumber = collection.blockNumber?.[network];

    console.log(
      chalk.cyan.bold(`\n🚀 Starting comparison for ${collection.name} (${networkName})...`)
    );
    console.log(chalk.gray(`📍 Polygon: ${collection.polygonAddress}`));
    console.log(chalk.gray(`📍 ${networkName}: ${networkAddress}`));

    if (collection.blockNumber) {
      console.log(chalk.gray('🔢 Block numbers:'));
      if (collection.blockNumber.polygon) {
        console.log(chalk.gray(`   Polygon: ${collection.blockNumber.polygon}`));
      }
      if (networkBlockNumber) {
        console.log(chalk.gray(`   ${networkName}: ${networkBlockNumber}`));
      }
    }

    console.log(chalk.cyan('─'.repeat(80)));

    // Set environment variables for this collection
    const env = {
      ...process.env,
      COLLECTION_NAME: collection.name,
      POLYGON_CONTRACT: collection.polygonAddress,
      BASE_CONTRACT: networkAddress,
      POLYGON_BLOCK: collection.blockNumber?.polygon || '',
      BASE_BLOCK: networkBlockNumber || '',
      NETWORK: network,
      BASE_NETWORK_NAME: networkName,
    };

    // Run the comparison script with the collection-specific environment
    const scriptPath = path.join(__dirname, 'compareOwnersAcrossChains.ts');
    const child = spawn('npx', ['ts-node', scriptPath], {
      env,
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    child.on('close', code => {
      if (code === 0) {
        console.log(
          chalk.green.bold(
            `✅ ${collection.name} (${networkName}) comparison completed successfully!\n`
          )
        );
        resolve();
      } else {
        console.log(
          chalk.red.bold(
            `❌ ${collection.name} (${networkName}) comparison failed with code ${code}\n`
          )
        );
        reject(
          new Error(`Collection ${collection.name} (${networkName}) failed with exit code ${code}`)
        );
      }
    });

    child.on('error', error => {
      console.log(
        chalk.red.bold(`❌ Error running ${collection.name} (${networkName}) comparison:`),
        error
      );
      reject(error);
    });
  });
}

// Main function to run all ERC1155 collections
async function runAllCollections(network: 'base' | 'basesepolia' = 'base'): Promise<void> {
  const networkName = network === 'basesepolia' ? 'Base Sepolia' : 'Base';

  console.log(chalk.magenta.bold('🎯 ERC1155 MULTI-COLLECTION CROSS-CHAIN COMPARISON'));
  console.log(chalk.cyan(`🌐 Network: Polygon ↔ ${networkName}`));
  console.log(chalk.cyan(`📦 Total ERC1155 collections to process: ${COLLECTIONS.length}`));
  console.log(chalk.gray(`🕒 Started at: ${new Date().toLocaleString()}`));
  console.log(chalk.magenta('═'.repeat(80)));

  // Validate environment
  if (!process.env.ALCHEMY_API_KEY) {
    console.error(
      chalk.red.bold('❌ ALCHEMY_API_KEY is required. Please set it in your environment variables.')
    );
    process.exit(1);
  }

  const results: { collection: string; status: 'success' | 'failed'; error?: string }[] = [];

  // Process collections sequentially to avoid rate limiting
  for (let i = 0; i < COLLECTIONS.length; i++) {
    const collection = COLLECTIONS[i];

    try {
      console.log(
        chalk.blue.bold(
          `\n[${i + 1}/${COLLECTIONS.length}] Processing ${collection.name} (${networkName})...`
        )
      );
      await runCollectionComparison(collection, network);
      results.push({ collection: `${collection.name} (${networkName})`, status: 'success' });

      // Add delay between collections to respect rate limits
      if (i < COLLECTIONS.length - 1) {
        console.log(chalk.yellow('⏳ Waiting 5 seconds before next collection...'));
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error(
        chalk.red.bold(`❌ Failed to process ${collection.name} (${networkName}):`),
        error
      );
      results.push({
        collection: `${collection.name} (${networkName})`,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Print final summary
  console.log(chalk.magenta.bold('\n🏁 FINAL SUMMARY'));
  console.log(chalk.magenta('═'.repeat(80)));

  const successful = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log(chalk.green(`✅ Successful: ${successful}/${COLLECTIONS.length}`));
  console.log(chalk.red(`❌ Failed: ${failed}/${COLLECTIONS.length}`));

  if (successful > 0) {
    console.log(chalk.green.bold('\n🎉 Successful collections:'));
    results
      .filter(r => r.status === 'success')
      .forEach(r => console.log(chalk.green(`  ✓ ${r.collection}`)));
  }

  if (failed > 0) {
    console.log(chalk.red.bold('\n💥 Failed collections:'));
    results
      .filter(r => r.status === 'failed')
      .forEach(r => console.log(chalk.red(`  ✗ ${r.collection}: ${r.error}`)));
  }

  console.log(chalk.gray(`\n🕒 Completed at: ${new Date().toLocaleString()}`));
  console.log(chalk.cyan('📁 Check the data/results/ folder for individual collection JSON files'));
}

// Parse command line arguments
function parseArguments(): 'base' | 'basesepolia' {
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

  // Default to base
  return 'base';
}

// Run the script
if (require.main === module) {
  const network = parseArguments();

  console.log(
    chalk.blue.bold(`🌐 Using network: ${network === 'basesepolia' ? 'Base Sepolia' : 'Base'}`)
  );

  runAllCollections(network).catch(error => {
    console.error(chalk.red.bold('❌ Fatal error:'), error);
    process.exit(1);
  });
}

export { runAllCollections, COLLECTIONS };
