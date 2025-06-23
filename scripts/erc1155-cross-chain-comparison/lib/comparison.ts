import chalk from 'chalk';
import { ComparisonResult, Owner, OwnerComparison } from './types';

export function compareOwnershipData(
  chainData: { [chainName: string]: Owner[] },
  collectionName: string
): ComparisonResult {
  console.log(chalk.cyan(`Analyzing ownership data for "${collectionName}" across chains...\n`));

  const chainNames = Object.keys(chainData);
  if (chainNames.length !== 2) {
    throw new Error('This comparison is designed for exactly 2 chains');
  }

  const [chain1Name, chain2Name] = chainNames;
  const chain1Owners = chainData[chain1Name];
  const chain2Owners = chainData[chain2Name];

  // Create maps for easier comparison
  const chain1Map = new Map<string, Owner>();
  const chain2Map = new Map<string, Owner>();

  chain1Owners.forEach(owner => chain1Map.set(owner.ownerAddress, owner));
  chain2Owners.forEach(owner => chain2Map.set(owner.ownerAddress, owner));

  // Find all unique addresses across both chains
  const allAddresses = new Set([...chain1Map.keys(), ...chain2Map.keys()]);

  // Categorize owners
  const ownersOnlyOnChain: { [chainName: string]: string[] } = {
    [chain1Name]: [],
    [chain2Name]: [],
  };
  const discrepancies: OwnerComparison[] = [];

  allAddresses.forEach(address => {
    const owner1 = chain1Map.get(address);
    const owner2 = chain2Map.get(address);

    // Owner only on chain 1
    if (owner1 && !owner2) {
      const ownerComparison: OwnerComparison = {
        ownerAddress: address,
        discrepancies: {
          tokenBalanceDiffs: owner1.tokenBalances.map(tb => ({
            tokenId: tb.tokenId,
            balances: { [chain1Name]: tb.balance, [chain2Name]: 0 },
          })),
        },
      };
      ownersOnlyOnChain[chain1Name].push(address);
      discrepancies.push(ownerComparison);
      return;
    }

    // Owner only on chain 2
    if (owner2 && !owner1) {
      const ownerComparison: OwnerComparison = {
        ownerAddress: address,
        discrepancies: {
          tokenBalanceDiffs: owner2.tokenBalances.map(tb => ({
            tokenId: tb.tokenId,
            balances: { [chain1Name]: 0, [chain2Name]: tb.balance },
          })),
        },
      };
      ownersOnlyOnChain[chain2Name].push(address);
      discrepancies.push(ownerComparison);
      return;
    }

    // Owner exists on both chains - compare balances
    if (owner1 && owner2) {
      // Check individual token balance discrepancies
      const allTokenIds = new Set<string>();
      owner1.tokenBalances.forEach(tb => allTokenIds.add(tb.tokenId));
      owner2.tokenBalances.forEach(tb => allTokenIds.add(tb.tokenId));

      const tokenBalanceDiffs: Array<{
        tokenId: string;
        balances: { [chainName: string]: number };
      }> = [];

      allTokenIds.forEach(tokenId => {
        const balance1 = owner1.tokenBalances.find(tb => tb.tokenId === tokenId)?.balance || 0;
        const balance2 = owner2.tokenBalances.find(tb => tb.tokenId === tokenId)?.balance || 0;

        const balances = {
          [chain1Name]: balance1,
          [chain2Name]: balance2,
        };

        const hasDifference = balance1 !== balance2;

        if (hasDifference) {
          tokenBalanceDiffs.push({
            tokenId,
            balances,
          });
        }
      });

      // Only include in discrepancies if there are actual differences
      if (tokenBalanceDiffs.length > 0) {
        const ownerComparison: OwnerComparison = {
          ownerAddress: address,
          discrepancies: {
            tokenBalanceDiffs,
          },
        };
        discrepancies.push(ownerComparison);
      }
      // Don't store complete matches
    }
  });

  // Generate summary
  const summary = {
    totalOwners: {
      [chain1Name]: chain1Owners.length,
      [chain2Name]: chain2Owners.length,
    },
    uniqueOwners: allAddresses.size,
    ownersWithDiscrepancies: discrepancies.length,
    tokenDiscrepancies: discrepancies.reduce(
      (sum, owner) => sum + owner.discrepancies.tokenBalanceDiffs.length,
      0
    ),
    chainsCompared: chainNames,
  };

  return {
    collectionName,
    timestamp: new Date().toISOString(),
    summary,
    discrepancies,
    detailedReport: {
      ownersOnlyOnChain,
    },
  };
}

export function compareAdjustedBalances(
  originalResult: ComparisonResult,
  adjustedPolygonData: Owner[],
  baseSepoliaData: Owner[],
  collectionName: string,
  addressesToExclude: Set<string>
): ComparisonResult {
  console.log(chalk.cyan.bold('\n🔍 COMPARING ADJUSTED BALANCES'));
  console.log(chalk.blue('Comparing adjusted Polygon balances vs Base Sepolia...\n'));

  // Filter out excluded addresses from both datasets
  const filteredPolygonData = adjustedPolygonData.filter(
    owner => !addressesToExclude.has(owner.ownerAddress.toLowerCase())
  );
  const filteredBaseSepoliaData = baseSepoliaData.filter(
    owner => !addressesToExclude.has(owner.ownerAddress.toLowerCase())
  );

  console.log(chalk.blue(`📊 Filtered out ${addressesToExclude.size} addresses from comparison`));
  console.log(
    chalk.blue(
      `📊 Comparing ${filteredPolygonData.length} Polygon owners vs ${filteredBaseSepoliaData.length} Base Sepolia owners`
    )
  );

  // Create adjusted chain data
  const adjustedChainData = {
    'Polygon (Adjusted)': filteredPolygonData,
    BaseSepolia: filteredBaseSepoliaData,
  };

  // Run comparison with adjusted data
  const adjustedResult = compareOwnershipData(
    adjustedChainData,
    `${collectionName} (Adjusted Comparison)`
  );

  // Print comparison between original and adjusted results
  console.log(chalk.cyan.bold('\n📊 ADJUSTMENT EFFECTIVENESS ANALYSIS'));
  console.log(chalk.cyan('='.repeat(80)));

  console.log(chalk.yellow.bold('\n📈 BEFORE vs AFTER ADJUSTMENT:'));
  console.log(`${chalk.blue('Original discrepancies:')} ${originalResult.discrepancies.length}`);
  console.log(`${chalk.blue('Adjusted discrepancies:')} ${adjustedResult.discrepancies.length}`);
  console.log(
    `${chalk.green('Discrepancies resolved:')} ${originalResult.discrepancies.length - adjustedResult.discrepancies.length}`
  );

  const resolutionRate =
    originalResult.discrepancies.length > 0
      ? (
          ((originalResult.discrepancies.length - adjustedResult.discrepancies.length) /
            originalResult.discrepancies.length) *
          100
        ).toFixed(1)
      : '0';

  console.log(`${chalk.green('Resolution rate:')} ${resolutionRate}%`);

  if (adjustedResult.discrepancies.length === 0) {
    console.log(chalk.green.bold('\n🎉 ALL DISCREPANCIES RESOLVED!'));
    console.log(chalk.green('The transfer analysis completely explains all balance differences.'));
  } else if (adjustedResult.discrepancies.length < originalResult.discrepancies.length) {
    console.log(chalk.yellow.bold('\n✅ PARTIAL RESOLUTION'));
    console.log(chalk.yellow('Some discrepancies were resolved, but others remain unexplained.'));
  } else {
    console.log(chalk.red.bold('\n❌ NO IMPROVEMENT'));
    console.log(chalk.red('The transfer analysis did not resolve the discrepancies.'));
  }

  console.log(chalk.cyan('\n' + '='.repeat(80)));

  return adjustedResult;
}
