import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { ChainConfig, TokenIdComparisonResult } from './lib/types';
import { fetchAllFakeGotchiStatistics } from './lib/fetchers';
import { compareTokenIds } from './lib/comparison';

dotenv.config();

function validateEnvironment(): void {
  if (!process.env.SUBGRAPH_KEY) {
    throw new Error('SUBGRAPH_KEY environment variable is required');
  }
}

function getChainConfigs(): ChainConfig[] {
  return [
    {
      name: 'Polygon',
      endpoint: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-matic/api`,
      blockNumber: 73121283,
    },
    {
      name: 'Base Sepolia',
      endpoint: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-baseSepolia/version/baseSepolia-test-mints-27/api`,
    },
  ];
}

async function saveResults(result: TokenIdComparisonResult): Promise<void> {
  const resultsDir = path.join(__dirname, 'results');
  await fs.mkdir(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(resultsDir, `fakegotchi-statistics-comparison-${timestamp}.json`);

  await fs.writeFile(filename, JSON.stringify(result, null, 2));
  console.log(chalk.green(`💾 Results saved to: ${filename}`));
}

function printSummary(result: TokenIdComparisonResult): void {
  console.log('\n' + chalk.blue('='.repeat(80)));
  console.log(chalk.blue.bold('📊 FAKE GOTCHI STATISTICS TOKEN ID COMPARISON SUMMARY'));
  console.log(chalk.blue('='.repeat(80)));

  console.log(chalk.cyan('\n📈 Overview:'));
  console.log(`  • Total statistics compared: ${chalk.white.bold(result.totalStatisticsCompared)}`);
  console.log(
    `  • Total unique token IDs: ${chalk.white.bold(result.summary.totalUniqueTokenIds)}`
  );

  console.log(chalk.cyan('\n🔍 Token ID Distribution:'));
  console.log(`  • Token IDs only on Polygon: ${chalk.red.bold(result.summary.polygonOnlyCount)}`);
  console.log(
    `  • Token IDs only on Base Sepolia: ${chalk.yellow.bold(result.summary.baseSepoliaOnlyCount)}`
  );

  if (result.summary.polygonOnlyCount > 0) {
    console.log(chalk.cyan('\n🔥 Token IDs only on Polygon (first 20):'));
    const displayTokenIds = result.polygonOnlyTokenIds.slice(0, 20);
    displayTokenIds.forEach((tokenId, index) => {
      if (index % 5 === 0) console.log(''); // New line every 5 items
      process.stdout.write(`    ${chalk.red.bold(tokenId.padStart(6))} `);
    });
    console.log(''); // Final newline

    if (result.polygonOnlyTokenIds.length > 20) {
      console.log(
        chalk.gray(`    ... and ${result.polygonOnlyTokenIds.length - 20} more token IDs`)
      );
    }
  }

  if (result.summary.baseSepoliaOnlyCount > 0) {
    console.log(chalk.cyan('\n🟡 Token IDs only on Base Sepolia (first 20):'));
    const displayTokenIds = result.baseSpoliaOnlyTokenIds.slice(0, 20);
    displayTokenIds.forEach((tokenId, index) => {
      if (index % 5 === 0) console.log(''); // New line every 5 items
      process.stdout.write(`    ${chalk.yellow.bold(tokenId.padStart(6))} `);
    });
    console.log(''); // Final newline

    if (result.baseSpoliaOnlyTokenIds.length > 20) {
      console.log(
        chalk.gray(`    ... and ${result.baseSpoliaOnlyTokenIds.length - 20} more token IDs`)
      );
    }
  }

  const polygonCoverage =
    result.summary.totalUniqueTokenIds > 0
      ? ((result.summary.polygonOnlyCount / result.summary.totalUniqueTokenIds) * 100).toFixed(2)
      : '0.00';

  const baseSepoliaCoverage =
    result.summary.totalUniqueTokenIds > 0
      ? ((result.summary.baseSepoliaOnlyCount / result.summary.totalUniqueTokenIds) * 100).toFixed(
          2
        )
      : '0.00';

  console.log(chalk.cyan('\n📊 Coverage Analysis:'));
  console.log(
    `  • Polygon exclusive token IDs: ${chalk.blue.bold(polygonCoverage + '%')} of all unique token IDs`
  );
  console.log(
    `  • Base Sepolia exclusive token IDs: ${chalk.magenta.bold(baseSepoliaCoverage + '%')} of all unique token IDs`
  );

  const statisticsDiscrepancies = Object.keys(result.detailedComparison).length;
  console.log(chalk.cyan('\n🔎 Statistics Comparison:'));
  console.log(`  • Statistics with discrepancies: ${chalk.yellow.bold(statisticsDiscrepancies)}`);

  if (statisticsDiscrepancies > 0) {
    console.log(chalk.cyan('\n📋 Sample Statistics Discrepancies:'));
    const sampleStatistics = Object.keys(result.detailedComparison).slice(0, 3);

    sampleStatistics.forEach(statisticId => {
      const discrepancies = result.detailedComparison[statisticId];
      console.log(
        `  • Statistic ${chalk.white.bold(statisticId)}: ${discrepancies.length} discrepancies`
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

    if (statisticsDiscrepancies > 3) {
      console.log(`  ... and ${statisticsDiscrepancies - 3} more discrepant statistics`);
    }
  }

  console.log(chalk.blue('\n' + '='.repeat(80)));
  console.log(chalk.gray(`Comparison completed at: ${result.timestamp}`));
  console.log(chalk.blue('='.repeat(80) + '\n'));
}

async function main(): Promise<void> {
  try {
    console.log(chalk.blue.bold('🚀 Starting Fake Gotchi Statistics Comparison'));
    console.log(
      chalk.gray(
        'This script compares fake gotchi statistics between Polygon and Base Sepolia subgraphs\n'
      )
    );

    // Validate environment
    validateEnvironment();

    // Get chain configurations
    const chainConfigs = getChainConfigs();
    console.log(chalk.gray(`Configured chains: ${chainConfigs.map(c => c.name).join(', ')}\n`));

    // Fetch data from both subgraphs in parallel
    console.log(chalk.blue('📡 Fetching data from subgraphs...'));
    const [polygonData, baseSepoliaData] = await Promise.all([
      fetchAllFakeGotchiStatistics(chainConfigs[0]),
      fetchAllFakeGotchiStatistics(chainConfigs[1]),
    ]);

    console.log(chalk.green(`\n✅ Data fetching completed:`));
    console.log(`  • ${chainConfigs[0].name}: ${polygonData.size} statistics`);
    console.log(`  • ${chainConfigs[1].name}: ${baseSepoliaData.size} statistics\n`);

    // Compare token IDs
    const comparisonResult = await compareTokenIds(polygonData, baseSepoliaData);

    // Save results
    await saveResults(comparisonResult);

    // Print summary
    printSummary(comparisonResult);

    // Exit with appropriate code
    if (comparisonResult.summary.polygonOnlyCount === 0) {
      console.log(
        chalk.green.bold('🎉 All token IDs from Polygon are also present on Base Sepolia!')
      );
      process.exit(0);
    } else {
      console.log(
        chalk.yellow.bold(
          `⚠️  Found ${comparisonResult.summary.polygonOnlyCount} token IDs that exist on Polygon but not on Base Sepolia.`
        )
      );
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
