import chalk from 'chalk';
import type {
  Owner,
  OnChainBalance,
  BalanceComparison,
  ItemAnalysis,
  ComparisonResult,
} from './types';
import { calculateDiscrepancy, isZeroAddress } from './utils';

export function compareBalances(
  itemId: string,
  subgraphOwners: Owner[],
  onChainBalances: OnChainBalance[]
): ItemAnalysis {
  console.log(chalk.blue(`Comparing balances for item ${itemId}...`));

  // Create maps for easier lookup
  const sgMap = new Map<string, string>();
  const ocMap = new Map<string, string>();

  // Process subgraph data
  subgraphOwners.forEach(owner => {
    if (!isZeroAddress(owner.owner)) {
      sgMap.set(owner.owner.toLowerCase(), owner.balance);
    }
  });

  // Process on-chain data
  onChainBalances.forEach(balance => {
    if (!isZeroAddress(balance.address)) {
      ocMap.set(balance.address.toLowerCase(), balance.balance);
    }
  });

  // Get all unique addresses
  const allAddresses = new Set([...sgMap.keys(), ...ocMap.keys()]);
  const discrepancies: BalanceComparison[] = [];

  // Compare balances for each address
  for (const address of allAddresses) {
    const sgBalance = sgMap.get(address) || '0';
    const ocBalance = ocMap.get(address) || '0';
    const discrepancy = calculateDiscrepancy(sgBalance, ocBalance);

    let discrepancyType: BalanceComparison['discrepancyType'];

    if (sgBalance === '0' && ocBalance !== '0') {
      discrepancyType = 'missing_from_subgraph';
    } else if (sgBalance !== '0' && ocBalance === '0') {
      discrepancyType = 'missing_from_onchain';
    } else if (sgBalance !== ocBalance) {
      discrepancyType = 'balance_mismatch';
    } else {
      discrepancyType = 'match';
    }

    // Only add discrepancies (not matches)
    if (discrepancyType !== 'match') {
      discrepancies.push({
        address,
        subgraphBalance: sgBalance,
        onChainBalance: ocBalance,
        discrepancy,
        discrepancyType,
      });
    }
  }

  // Calculate totals
  const totalSubgraphBalance = Array.from(sgMap.values())
    .reduce((sum, balance) => sum + parseInt(balance), 0)
    .toString();

  const totalOnChainBalance = Array.from(ocMap.values())
    .reduce((sum, balance) => sum + parseInt(balance), 0)
    .toString();

  const analysis: ItemAnalysis = {
    itemId,
    totalSubgraphOwners: sgMap.size,
    totalOnChainOwners: ocMap.size,
    totalSubgraphBalance,
    totalOnChainBalance,
    balancesMatch: discrepancies.length === 0,
    discrepancies,
  };

  if (discrepancies.length > 0) {
    console.log(chalk.yellow(`Found ${discrepancies.length} discrepancies for item ${itemId}`));
  } else {
    console.log(chalk.green(`No discrepancies found for item ${itemId}`));
  }

  return analysis;
}

export function generateComparisonResult(itemAnalyses: ItemAnalysis[]): ComparisonResult {
  const timestamp = new Date().toISOString();
  const itemsWithDiscrepancies = itemAnalyses.filter(item => !item.balancesMatch).length;

  // Calculate summary statistics
  let totalSubgraphOwners = 0;
  let totalOnChainOwners = 0;
  let totalSubgraphBalance = 0;
  let totalOnChainBalance = 0;
  let missingFromSubgraph = 0;
  let missingFromOnChain = 0;
  let balanceMismatches = 0;
  let totalDiscrepancies = 0;

  itemAnalyses.forEach(item => {
    totalSubgraphOwners += item.totalSubgraphOwners;
    totalOnChainOwners += item.totalOnChainOwners;
    totalSubgraphBalance += parseInt(item.totalSubgraphBalance) || 0;
    totalOnChainBalance += parseInt(item.totalOnChainBalance) || 0;
    totalDiscrepancies += item.discrepancies.length;

    item.discrepancies.forEach(discrepancy => {
      switch (discrepancy.discrepancyType) {
        case 'missing_from_subgraph':
          missingFromSubgraph++;
          break;
        case 'missing_from_onchain':
          missingFromOnChain++;
          break;
        case 'balance_mismatch':
          balanceMismatches++;
          break;
      }
    });
  });

  return {
    timestamp,
    totalItemsChecked: itemAnalyses.length,
    totalDiscrepancies,
    itemsWithDiscrepancies,
    summary: {
      totalSubgraphOwners,
      totalOnChainOwners,
      totalSubgraphBalance: totalSubgraphBalance.toString(),
      totalOnChainBalance: totalOnChainBalance.toString(),
      missingFromSubgraph,
      missingFromOnChain,
      balanceMismatches,
    },
    itemAnalyses,
  };
}

export function printComparisonSummary(result: ComparisonResult): void {
  console.log('\n' + '='.repeat(60));
  console.log(chalk.bold.cyan('WEARABLE BALANCE COMPARISON SUMMARY'));
  console.log('='.repeat(60));

  console.log(chalk.bold(`Timestamp: ${result.timestamp}`));
  console.log(chalk.bold(`Total Items Checked: ${result.totalItemsChecked}`));
  console.log(chalk.bold(`Items with Discrepancies: ${result.itemsWithDiscrepancies}`));
  console.log(chalk.bold(`Total Discrepancies: ${result.totalDiscrepancies}`));

  console.log('\n' + chalk.bold.underline('Summary Statistics:'));
  console.log(
    `Total Subgraph Owners: ${chalk.blue(result.summary.totalSubgraphOwners.toLocaleString())}`
  );
  console.log(
    `Total On-Chain Owners: ${chalk.blue(result.summary.totalOnChainOwners.toLocaleString())}`
  );
  console.log(
    `Total Subgraph Balance: ${chalk.blue(parseInt(result.summary.totalSubgraphBalance).toLocaleString())}`
  );
  console.log(
    `Total On-Chain Balance: ${chalk.blue(parseInt(result.summary.totalOnChainBalance).toLocaleString())}`
  );

  console.log('\n' + chalk.bold.underline('Discrepancy Breakdown:'));
  console.log(
    `Missing from Subgraph: ${chalk.red(result.summary.missingFromSubgraph.toLocaleString())}`
  );
  console.log(
    `Missing from On-Chain: ${chalk.yellow(result.summary.missingFromOnChain.toLocaleString())}`
  );
  console.log(
    `Balance Mismatches: ${chalk.magenta(result.summary.balanceMismatches.toLocaleString())}`
  );

  if (result.itemsWithDiscrepancies > 0) {
    console.log('\n' + chalk.bold.underline('Items with Discrepancies:'));
    result.itemAnalyses
      .filter(item => !item.balancesMatch)
      .forEach(item => {
        console.log(
          `${chalk.yellow('Item')} ${item.itemId}: ${item.discrepancies.length} discrepancies`
        );
      });
  }

  console.log('\n' + '='.repeat(60));
}
