import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { ChainConfig, ComparisonResult, InstallationInfo } from './lib/types';
import { fetchAllInstallations } from './lib/fetchers';
import { compareMetadata } from './lib/comparison';

dotenv.config();

function validateEnvironment(): void {
  if (!process.env.SUBGRAPH_KEY) {
    throw new Error('SUBGRAPH_KEY environment variable is required');
  }
}

function getChainConfigs(): ChainConfig[] {
  return [
    {
      name: 'Polygon Gotchiverse',
      endpoint: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/gotchiverse-matic/api`,
      blockNumber: 74905712,
    },
    {
      name: 'Base Gotchiverse',
      endpoint: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/gotchiverse-base/version/base-realm-5/api`,
    },
  ];
}

async function saveResults(result: ComparisonResult): Promise<void> {
  const resultsDir = path.join(__dirname, 'results');
  await fs.mkdir(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(resultsDir, `installations-comparison-${timestamp}.json`);

  await fs.writeFile(filename, JSON.stringify(result, null, 2));
  console.log(chalk.green(`💾 Results saved to: ${filename}`));
}

function printSummary(result: ComparisonResult): void {
  console.log('\n' + chalk.blue('='.repeat(80)));
  console.log(chalk.blue.bold('📊 EQUIPPED INSTALLATIONS COMPARISON SUMMARY'));
  console.log(chalk.blue('='.repeat(80)));

  console.log(chalk.cyan('\n📈 Overview:'));
  console.log(`  • Total installations compared: ${chalk.white.bold(result.totalCompared)}`);
  console.log(`  • Identical: ${chalk.green.bold(result.summary.identicalCount)}`);
  console.log(`  • Discrepant: ${chalk.yellow.bold(result.summary.discrepantCount)}`);
  console.log(`  • Total discrepancies: ${chalk.red.bold(result.totalDiscrepancies)}`);

  console.log(chalk.cyan('\n🔍 Missing Data:'));
  console.log(`  • Missing on Polygon: ${chalk.red.bold(result.summary.missingSubgraph1Count)}`);
  console.log(`  • Missing on Base: ${chalk.red.bold(result.summary.missingSubgraph2Count)}`);

  if (Object.keys(result.summary.discrepanciesByField).length > 0) {
    console.log(chalk.cyan('\n📋 Discrepancies by Field:'));
    const sortedFields = Object.entries(result.summary.discrepanciesByField)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10); // Show top 10 fields with most discrepancies

    sortedFields.forEach(([field, count]) => {
      console.log(`  • ${field}: ${chalk.yellow.bold(count)} discrepancies`);
    });

    if (Object.keys(result.summary.discrepanciesByField).length > 10) {
      console.log(
        `  • ... and ${Object.keys(result.summary.discrepanciesByField).length - 10} more fields`
      );
    }
  }

  if (result.summary.discrepantCount > 0) {
    console.log(chalk.cyan('\n🔎 Sample Discrepancies:'));
    const sampleTokens = Object.keys(result.discrepanciesByToken).slice(0, 5);

    sampleTokens.forEach(tokenId => {
      const discrepancies = result.discrepanciesByToken[tokenId];
      console.log(
        `  • Installation ${chalk.white.bold(tokenId)}: ${discrepancies.length} discrepancies`
      );

      discrepancies.slice(0, 2).forEach(discrepancy => {
        const type = discrepancy.discrepancyType === 'value_mismatch' ? '≠' : '?';
        console.log(
          `    ${type} ${discrepancy.field}: ${JSON.stringify(discrepancy.subgraph1Value)} vs ${JSON.stringify(discrepancy.subgraph2Value)}`
        );
      });

      if (discrepancies.length > 2) {
        console.log(`    ... and ${discrepancies.length - 2} more discrepancies`);
      }
    });

    if (result.summary.discrepantCount > 5) {
      console.log(`  ... and ${result.summary.discrepantCount - 5} more discrepant installations`);
    }
  }

  const accuracy =
    result.totalCompared > 0
      ? ((result.summary.identicalCount / result.totalCompared) * 100).toFixed(2)
      : '0.00';

  console.log(chalk.cyan('\n✨ Data Accuracy:'));
  console.log(
    `  • ${chalk.green.bold(accuracy + '%')} of equipped installations are identical between subgraphs`
  );

  console.log(chalk.blue('\n' + '='.repeat(80)));
  console.log(chalk.gray(`Comparison completed at: ${result.timestamp}`));
  console.log(chalk.blue('='.repeat(80) + '\n'));
}

async function main(): Promise<void> {
  try {
    console.log('🔧 DEBUG: Script starting - main() function called');
    console.log(chalk.blue.bold('🚀 Starting Equipped Installations Comparison'));
    console.log(
      chalk.gray('This script compares equipped installations metadata between two subgraphs\n')
    );

    // Validate environment
    validateEnvironment();

    // Get chain configurations
    const chainConfigs = getChainConfigs();
    console.log(chalk.gray(`Configured chains: ${chainConfigs.map(c => c.name).join(', ')}\n`));

    // Fetch data from both subgraphs in parallel
    console.log(chalk.blue('📡 Fetching data from subgraphs...'));
    const [subgraph1Data, subgraph2Data] = await Promise.all([
      fetchAllInstallations(chainConfigs[0]),
      fetchAllInstallations(chainConfigs[1]),
    ]);

    console.log(chalk.green(`\n✅ Data fetching completed:`));
    console.log(`  • ${chainConfigs[0].name}: ${subgraph1Data.size} equipped installations`);
    console.log(`  • ${chainConfigs[1].name}: ${subgraph2Data.size} equipped installations\n`);

    // Compare metadata
    const comparisonResult = await compareMetadata(
      subgraph1Data,
      subgraph2Data,
      chainConfigs[0].name,
      chainConfigs[1].name
    );

    // Save results
    await saveResults(comparisonResult);

    // Print summary
    printSummary(comparisonResult);

    // Exit with appropriate code
    if (comparisonResult.totalDiscrepancies === 0) {
      console.log(
        chalk.green.bold('🎉 All equipped installations metadata is identical between subgraphs!')
      );
      process.exit(0);
    } else {
      console.log(chalk.yellow.bold('⚠️  Found discrepancies in equipped installations metadata.'));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red.bold('\n❌ Comparison failed:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));

    if (error instanceof Error && error.stack) {
      console.error(chalk.gray('\nStack trace:'));
      console.error(chalk.gray(error.stack));
    }

    process.exit(1);
  }
}

// Handle script termination gracefully
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n⚠️  Received SIGINT, exiting gracefully...'));
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n⚠️  Received SIGTERM, exiting gracefully...'));
  process.exit(143);
});

// Run the main function
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red.bold('💥 Unhandled error in main:'));
    console.error(chalk.red(error));
    process.exit(1);
  });
}
