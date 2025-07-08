import chalk from 'chalk';
import { ComparisonResult, Owner, OwnerComparison } from './types';

// Addresses to exclude from discrepancy analysis (known system/bridge addresses)
// THIS is PIXELCRAFT'S ADDRESS
const EXCLUDED_ADDRESSES = new Set([
  '0x01F010a5e001fe9d6940758EA5e8c777885E351e'.toLowerCase(), // Known system address
]);

export function compareOwnershipData(
  chainData: { [chainName: string]: Owner[] },
  collectionName: string,
  contractAddresses?: { [chainName: string]: string }
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

  // Filter out excluded addresses
  const filteredAddresses = new Set(
    [...allAddresses].filter(address => !EXCLUDED_ADDRESSES.has(address.toLowerCase()))
  );

  if (allAddresses.size !== filteredAddresses.size) {
    const excludedCount = allAddresses.size - filteredAddresses.size;
    console.log(chalk.gray(`🚫 Excluded ${excludedCount} known system address(es) from analysis`));
  }

  // Categorize owners
  const ownersOnlyOnChain: { [chainName: string]: string[] } = {
    [chain1Name]: [],
    [chain2Name]: [],
  };
  const discrepancies: OwnerComparison[] = [];

  filteredAddresses.forEach(address => {
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

        // Convert both balances to numbers for proper comparison
        const numBalance1 = typeof balance1 === 'string' ? parseInt(balance1, 10) : balance1;
        const numBalance2 = typeof balance2 === 'string' ? parseInt(balance2, 10) : balance2;
        const hasDifference = numBalance1 !== numBalance2;

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
    uniqueOwners: filteredAddresses.size,
    ownersWithDiscrepancies: discrepancies.length,
    tokenDiscrepancies: discrepancies.reduce(
      (sum, owner) => sum + owner.discrepancies.tokenBalanceDiffs.length,
      0
    ),
    chainsCompared: chainNames,
    contractAddresses: contractAddresses || {},
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
