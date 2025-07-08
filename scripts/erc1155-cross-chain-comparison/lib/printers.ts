import chalk from 'chalk';
import { ComparisonResult } from './types';

export function printResults(result: ComparisonResult): void {
  console.log(chalk.cyan.bold(`\n🔍 ERC1155 CROSS-CHAIN COMPARISON RESULTS`));
  console.log(chalk.magenta.bold(`📦 Collection: ${result.collectionName}`));
  console.log(
    chalk.gray(`🕒 Analysis completed at: ${new Date(result.timestamp).toLocaleString()}`)
  );
  console.log(chalk.cyan('='.repeat(80)));

  // Summary
  console.log(chalk.yellow.bold('\n📊 SUMMARY:'));
  console.log(`${chalk.blue('Collection:')} ${result.collectionName}`);
  console.log(`${chalk.blue('Chains compared:')} ${result.summary.chainsCompared.join(', ')}`);
  console.log(`${chalk.blue('Unique owners across all chains:')} ${result.summary.uniqueOwners}`);

  Object.entries(result.summary.totalOwners).forEach(([chain, count]) => {
    console.log(`${chalk.blue(`Owners on ${chain}:`)} ${count}`);
  });

  console.log(
    `${chalk.red('Owners with discrepancies:')} ${result.summary.ownersWithDiscrepancies}`
  );
  console.log(`${chalk.red('Total token discrepancies:')} ${result.summary.tokenDiscrepancies}`);

  // Owners only on specific chains
  console.log(chalk.yellow.bold('\n🏷️  CHAIN-EXCLUSIVE OWNERS:'));
  let hasExclusiveOwners = false;
  Object.entries(result.detailedReport.ownersOnlyOnChain).forEach(([chain, owners]) => {
    if (owners.length > 0) {
      hasExclusiveOwners = true;
      console.log(`${chalk.blue(`Only on ${chain}:`)} ${owners.length} owners`);
      if (owners.length <= 20) {
        owners.forEach(owner => console.log(`  - ${owner}`));
      } else {
        owners.slice(0, 10).forEach(owner => console.log(`  - ${owner}`));
        console.log(`  ... and ${owners.length - 10} more`);
      }
    }
  });

  if (!hasExclusiveOwners) {
    console.log(chalk.green('✓ No chain-exclusive owners found'));
  }

  // Discrepancies
  if (result.discrepancies.length > 0) {
    console.log(chalk.red.bold('\n⚠️  DISCREPANCIES FOUND:'));

    // Separate owners by type of discrepancy
    const chainExclusiveOwners = result.discrepancies.filter(owner => {
      // Check if any token has a zero balance on one chain (chain-exclusive)
      return owner.discrepancies.tokenBalanceDiffs.some(diff =>
        Object.values(diff.balances).includes(0)
      );
    });
    const balanceDiscrepancyOwners = result.discrepancies.filter(owner => {
      // Check if all tokens have non-zero balances on both chains (pure balance differences)
      return owner.discrepancies.tokenBalanceDiffs.every(diff =>
        Object.values(diff.balances).every(balance => balance > 0)
      );
    });

    console.log(`${chalk.cyan('Chain-exclusive owners:')} ${chainExclusiveOwners.length}`);
    console.log(`${chalk.cyan('Balance discrepancy owners:')} ${balanceDiscrepancyOwners.length}`);

    // Show balance discrepancies first (these are more interesting)
    if (balanceDiscrepancyOwners.length > 0) {
      console.log(chalk.yellow.bold('\n📊 BALANCE DISCREPANCIES:'));
      const topBalanceDiscrepancies = balanceDiscrepancyOwners.slice(0, 15);

      topBalanceDiscrepancies.forEach((owner, index) => {
        console.log(`\n${chalk.red(`${index + 1}. ${owner.ownerAddress}`)}`);

        // Calculate total balances per chain from discrepancies
        const chainTotals: { [chainName: string]: number } = {};
        const chainTokenCounts: { [chainName: string]: Set<string> } = {};

        owner.discrepancies.tokenBalanceDiffs.forEach(diff => {
          Object.entries(diff.balances).forEach(([chain, balance]) => {
            if (!chainTotals[chain]) {
              chainTotals[chain] = 0;
              chainTokenCounts[chain] = new Set();
            }
            chainTotals[chain] += Number(balance); // Ensure numeric addition
            if (Number(balance) > 0) {
              chainTokenCounts[chain].add(diff.tokenId);
            }
          });
        });

        Object.entries(chainTotals).forEach(([chain, totalBalance]) => {
          const tokenCount = chainTokenCounts[chain]?.size || 0;
          console.log(
            `  ${chalk.blue(chain)}: ${totalBalance} total tokens (${tokenCount} different token IDs)`
          );
        });

        // Show tokens with differences (already filtered)
        const tokensWithDifferences = owner.discrepancies.tokenBalanceDiffs;
        if (tokensWithDifferences.length > 0) {
          console.log(
            chalk.yellow(`  Tokens with differences (${tokensWithDifferences.length} total):`)
          );
          tokensWithDifferences.slice(0, 5).forEach(diff => {
            console.log(`    Token ${diff.tokenId}:`);
            Object.entries(diff.balances).forEach(([chain, balance]) => {
              console.log(`      ${chain}: ${balance}`);
            });
          });
          if (tokensWithDifferences.length > 5) {
            console.log(
              `    ... and ${tokensWithDifferences.length - 5} more tokens with differences`
            );
          }
        }
      });

      if (balanceDiscrepancyOwners.length > 15) {
        console.log(
          chalk.yellow(
            `\n... and ${balanceDiscrepancyOwners.length - 15} more owners with balance discrepancies`
          )
        );
      }
    }
  } else {
    console.log(chalk.green.bold('\n✅ NO DISCREPANCIES FOUND!'));
    console.log('All owners have consistent balances across chains.');
  }

  console.log(chalk.cyan('\n' + '='.repeat(80)));
}
