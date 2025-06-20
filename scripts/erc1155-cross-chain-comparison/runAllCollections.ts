import { spawn } from 'child_process';
import path from 'path';
import chalk from 'chalk';
import { baseSepoliaAddresses, polygonAddresses } from './chainAddresses';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Define all ERC1155 collections to compare
interface CollectionDefinition {
  name: string;
  baseSepoliaAddress: string;
  polygonAddress: string;
  blockNumber?: {
    baseSepolia?: string;
    polygon?: string;
  };
}

const COLLECTIONS: CollectionDefinition[] = [
  {
    name: 'Installations',
    baseSepoliaAddress: baseSepoliaAddresses.installationsDiamond,
    polygonAddress: polygonAddresses.installationsDiamond,
    blockNumber: {
      polygon: '72386800', // You can set specific block numbers for each collection
      // baseSepolia: '12345678', // Uncomment and set if needed
    },
  },
  {
    name: 'Tiles',
    baseSepoliaAddress: baseSepoliaAddresses.tilesDiamond,
    polygonAddress: polygonAddresses.tilesDiamond,
  },
  //   {
  //     name: 'Wearables',
  //     baseSepoliaAddress: baseSepoliaAddresses.wearableDiamond,
  //     polygonAddress: polygonAddresses.wearableDiamond,
  //   },
  {
    name: 'FakeCards',
    baseSepoliaAddress: baseSepoliaAddresses.fakeCardsDiamond,
    polygonAddress: polygonAddresses.fakeCardsDiamond,
  },
  {
    name: 'Forge',
    baseSepoliaAddress: baseSepoliaAddresses.forgeDiamond,
    polygonAddress: polygonAddresses.forgeDiamond,
  },
];

// Function to run comparison for a single collection
function runCollectionComparison(collection: CollectionDefinition): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(chalk.cyan.bold(`\n🚀 Starting comparison for ${collection.name}...`));
    console.log(chalk.gray(`📍 Polygon: ${collection.polygonAddress}`));
    console.log(chalk.gray(`📍 BaseSepolia: ${collection.baseSepoliaAddress}`));

    if (collection.blockNumber) {
      console.log(chalk.gray('🔢 Block numbers:'));
      if (collection.blockNumber.polygon) {
        console.log(chalk.gray(`   Polygon: ${collection.blockNumber.polygon}`));
      }
      if (collection.blockNumber.baseSepolia) {
        console.log(chalk.gray(`   BaseSepolia: ${collection.blockNumber.baseSepolia}`));
      }
    }

    console.log(chalk.cyan('─'.repeat(80)));

    // Set environment variables for this collection
    const env = {
      ...process.env,
      COLLECTION_NAME: collection.name,
      POLYGON_CONTRACT: collection.polygonAddress,
      BASE_SEPOLIA_CONTRACT: collection.baseSepoliaAddress,
      POLYGON_BLOCK: collection.blockNumber?.polygon || '',
      BASE_SEPOLIA_BLOCK: collection.blockNumber?.baseSepolia || '',
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
        console.log(chalk.green.bold(`✅ ${collection.name} comparison completed successfully!\n`));
        resolve();
      } else {
        console.log(chalk.red.bold(`❌ ${collection.name} comparison failed with code ${code}\n`));
        reject(new Error(`Collection ${collection.name} failed with exit code ${code}`));
      }
    });

    child.on('error', error => {
      console.log(chalk.red.bold(`❌ Error running ${collection.name} comparison:`), error);
      reject(error);
    });
  });
}

// Main function to run all ERC1155 collections
async function runAllCollections(): Promise<void> {
  console.log(chalk.magenta.bold('🎯 ERC1155 MULTI-COLLECTION CROSS-CHAIN COMPARISON'));
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
        chalk.blue.bold(`\n[${i + 1}/${COLLECTIONS.length}] Processing ${collection.name}...`)
      );
      await runCollectionComparison(collection);
      results.push({ collection: collection.name, status: 'success' });

      // Add delay between collections to respect rate limits
      if (i < COLLECTIONS.length - 1) {
        console.log(chalk.yellow('⏳ Waiting 5 seconds before next collection...'));
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error(chalk.red.bold(`❌ Failed to process ${collection.name}:`), error);
      results.push({
        collection: collection.name,
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

// Run the script
if (require.main === module) {
  runAllCollections().catch(error => {
    console.error(chalk.red.bold('❌ Fatal error:'), error);
    process.exit(1);
  });
}

export { runAllCollections, COLLECTIONS };
