import { GraphQLClient, gql } from 'graphql-request';
import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import {
  polygonAddresses,
  baseSepoliaAddresses,
} from '../erc1155-cross-chain-comparison/lib/chainAddresses';
import { ownerContractAddressesOnPolygon } from '../lib';

dotenv.config();

const subgraphEndpoint = `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-matic/version/matic-add-owners-to-wearables-6/api`;
const sepoliaSgEndpoint = `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-baseSepolia/version/baseSepolia-test-mints-3/api`;

interface Owner {
  owner: string;
  balance: string;
}

interface ItemTypeResponse {
  itemType: {
    owners: Owner[];
  } | null;
}

interface OwnerBalance {
  address: string;
  contractBalance: string;
}

interface ChainConfig {
  name: string;
  subgraphEndpoint: string;
  rpcUrl: string;
  contractAddress: string;
  blockNumber?: number;
}

interface ItemAnalysis {
  chain: string;
  itemId: string;
  totalSubgraphOwners: number;
  totalContractOwners: number;
  errors: number;
  owners: OwnerBalance[];
}

interface CrossChainDiscrepancy {
  itemId: string;
  address: string;
  polygonBalance: string;
  baseSepoliaBalance: string;
  discrepancyType: 'polygon_only' | 'base_sepolia_only' | 'balance_mismatch';
}

interface ChainSpecificData {
  totalItems: number;
  totalOwners: number;
  uniqueOwners: number; // Owners that exist only on this chain
}

interface ComparisonResult {
  timestamp: string;
  totalItemsCompared: number;
  totalDiscrepancies: number;
  discrepancyBreakdown: {
    polygonOnly: number;
    baseSepoliaOnly: number;
    balanceMismatch: number;
  };
  chainSpecificData: {
    polygon: ChainSpecificData;
    baseSepolia: ChainSpecificData;
  };
  discrepancies: CrossChainDiscrepancy[];
}

const ERC1155_ABI = [
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
  'function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids) external view returns (uint256[] memory)',
];

const BATCH_SIZE = 50;
const REQUEST_DELAY = 250; // 250ms between requests to avoid rate limiting
const CONTRACT_CALL_DELAY = 500; // 500ms between contract calls

// Create a set of addresses to exclude from comparison
const EXCLUDED_ADDRESSES = new Set([
  // Zero address
  '0x0000000000000000000000000000000000000000',

  // Polygon contract addresses
  polygonAddresses.realmDiamond.toLowerCase(),
  polygonAddresses.installationsDiamond.toLowerCase(),
  polygonAddresses.tilesDiamond.toLowerCase(),
  polygonAddresses.aavegotchiDiamond.toLowerCase(),
  polygonAddresses.wearableDiamond.toLowerCase(),
  polygonAddresses.forgeDiamond.toLowerCase(),
  polygonAddresses.gbmDiamond.toLowerCase(),
  polygonAddresses.treasury.toLowerCase(),
  polygonAddresses.maticBurnAddress.toLowerCase(),

  // Base Sepolia contract addresses
  baseSepoliaAddresses.realmDiamond.toLowerCase(),
  baseSepoliaAddresses.installationsDiamond.toLowerCase(),
  baseSepoliaAddresses.tilesDiamond.toLowerCase(),
  baseSepoliaAddresses.aavegotchiDiamond.toLowerCase(),
  baseSepoliaAddresses.wearableDiamond.toLowerCase(),
  baseSepoliaAddresses.forgeDiamond.toLowerCase(),
  baseSepoliaAddresses.gbmDiamond.toLowerCase(),
  baseSepoliaAddresses.guardianSkinsDiamond.toLowerCase(),

  // Owner contract addresses from Polygon
  ...ownerContractAddressesOnPolygon.map(addr => addr.toLowerCase()),

  '0x01F010a5e001fe9d6940758EA5e8c777885E351e'.toLowerCase(),
]);

function validateEnvironment(): void {
  if (!process.env.SUBGRAPH_KEY) {
    throw new Error('SUBGRAPH_KEY environment variable is required');
  }

  if (!process.env.POLYGON_RPC_URL) {
    throw new Error('POLYGON_RPC_URL environment variable is required');
  }

  if (!process.env.BASE_SEPOLIA_RPC_URL) {
    throw new Error('BASE_SEPOLIA_RPC_URL environment variable is required');
  }
}

function getChainConfigs(): ChainConfig[] {
  return [
    {
      name: 'Polygon',
      subgraphEndpoint,
      rpcUrl: process.env.POLYGON_RPC_URL!,
      contractAddress: polygonAddresses.aavegotchiDiamond,
      blockNumber: 73121283, // Set manually if needed: e.g., 50000000
    },
    {
      name: 'Base Sepolia',
      subgraphEndpoint: sepoliaSgEndpoint,
      rpcUrl: process.env.BASE_SEPOLIA_RPC_URL!,
      contractAddress: baseSepoliaAddresses.wearableDiamond,
      blockNumber: undefined, // Set manually if needed: e.g., 10000000
    },
  ];
}

function isAddressExcluded(address: string): boolean {
  return EXCLUDED_ADDRESSES.has(address.toLowerCase());
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllOwnersForItem(chainConfig: ChainConfig, itemId: string): Promise<Owner[]> {
  const client = new GraphQLClient(chainConfig.subgraphEndpoint);
  const allOwners: Owner[] = [];
  let hasMore = true;
  let skip = 0;
  const first = 1000; // Maximum allowed by most subgraphs

  const blockInfo = chainConfig.blockNumber ? ` at block ${chainConfig.blockNumber}` : '';
  console.log(
    chalk.blue(`Fetching owners for item ID: ${itemId} on ${chainConfig.name}${blockInfo}`)
  );

  while (hasMore) {
    try {
      const blockParam = chainConfig.blockNumber
        ? `, block: { number: ${chainConfig.blockNumber} }`
        : '';
      const query = gql`
        {
          itemType(id: "${itemId}"${blockParam}) {
            owners(first: ${first}, skip: ${skip}, orderBy: owner, orderDirection: desc, where: { balance_gt: "0" }) {
              owner
              balance
            }
          }
        }
      `;

      const response: ItemTypeResponse = await client.request(query);

      if (!response.itemType) {
        console.log(chalk.yellow(`Item ID ${itemId} not found in ${chainConfig.name} subgraph`));
        hasMore = false;
        break;
      }

      const owners = response.itemType.owners;

      if (owners.length === 0) {
        hasMore = false;
      } else {
        allOwners.push(...owners);
        skip += first;
        console.log(
          `  Fetched ${owners.length} owners (total: ${allOwners.length}, skip: ${skip})`
        );

        // If we got fewer items than requested, we've reached the end
        if (owners.length < first) {
          hasMore = false;
        } else {
          // Rate limiting
          await delay(REQUEST_DELAY);
        }
      }
    } catch (error) {
      console.error(
        chalk.red(
          `Error fetching owners for item ${itemId} on ${chainConfig.name} at skip ${skip}:`
        ),
        error
      );
      hasMore = false;
    }
  }

  console.log(
    chalk.green(
      `✓ Total owners found for item ${itemId} on ${chainConfig.name}: ${allOwners.length}`
    )
  );
  return allOwners;
}

async function checkContractBalancesBatch(
  chainConfig: ChainConfig,
  addresses: string[],
  itemId: string
): Promise<string[]> {
  try {
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const contract = new ethers.Contract(chainConfig.contractAddress, ERC1155_ABI, provider);
    const ids = new Array(addresses.length).fill(itemId);

    // Call balanceOfBatch at specific block if specified
    let balances;
    if (chainConfig.blockNumber) {
      balances = await contract.balanceOfBatch(addresses, ids, {
        blockTag: chainConfig.blockNumber,
      });
    } else {
      balances = await contract.balanceOfBatch(addresses, ids);
    }
    return balances.map((balance: bigint) => balance.toString());
  } catch (error) {
    console.error(
      chalk.red(
        `Error checking contract balances batch for item ${itemId} on ${chainConfig.name}:`
      ),
      error
    );
    throw error;
  }
}

async function analyzeItem(chainConfig: ChainConfig, itemId: string): Promise<ItemAnalysis> {
  const blockInfo = chainConfig.blockNumber ? ` at block ${chainConfig.blockNumber}` : '';
  console.log(
    chalk.cyan.bold(`\n🔍 Analyzing Item ID: ${itemId} on ${chainConfig.name}${blockInfo}`)
  );

  // Fetch all owners from subgraph
  const subgraphOwners = await fetchAllOwnersForItem(chainConfig, itemId);

  if (subgraphOwners.length === 0) {
    return {
      chain: chainConfig.name,
      itemId,
      totalSubgraphOwners: 0,
      totalContractOwners: 0,
      errors: 0,
      owners: [],
    };
  }

  const ownerBalances: OwnerBalance[] = [];
  let errors = 0;

  console.log(chalk.blue(`Checking contract balances for ${subgraphOwners.length} addresses...`));

  // Process owners in batches to avoid rate limiting
  for (let i = 0; i < subgraphOwners.length; i += BATCH_SIZE) {
    const batch = subgraphOwners.slice(i, i + BATCH_SIZE);
    const addresses = batch.map(owner => owner.owner);

    try {
      // Use batch call for efficiency
      const contractBalances = await checkContractBalancesBatch(chainConfig, addresses, itemId);

      for (let j = 0; j < batch.length; j++) {
        const owner = batch[j];
        const contractBalance = contractBalances[j];

        // Only store addresses with contract balance > 0 and not excluded
        if (parseInt(contractBalance) > 0 && !isAddressExcluded(owner.owner)) {
          ownerBalances.push({
            address: owner.owner,
            contractBalance,
          });
        }
      }

      console.log(
        `  Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(subgraphOwners.length / BATCH_SIZE)}`
      );

      // Rate limiting between batches
      if (i + BATCH_SIZE < subgraphOwners.length) {
        await delay(CONTRACT_CALL_DELAY);
      }
    } catch (error) {
      console.error(chalk.red(`Error processing batch starting at index ${i}:`), error);
      errors += batch.length;
    }
  }

  const analysis: ItemAnalysis = {
    chain: chainConfig.name,
    itemId,
    totalSubgraphOwners: subgraphOwners.length,
    totalContractOwners: ownerBalances.length,
    errors,
    owners: ownerBalances,
  };

  printItemSummary(analysis);
  return analysis;
}

function printItemSummary(analysis: ItemAnalysis): void {
  console.log(chalk.cyan(`\n📊 Summary for Item ID ${analysis.itemId}:`));
  console.log(`  Total addresses from subgraph: ${analysis.totalSubgraphOwners}`);
  console.log(`  Contract owners with balance > 0: ${chalk.green(analysis.totalContractOwners)}`);
  console.log(`  Errors: ${chalk.red(analysis.errors)}`);
}

async function findItemsWithOwners(chainConfig: ChainConfig): Promise<string[]> {
  const blockInfo = chainConfig.blockNumber ? ` at block ${chainConfig.blockNumber}` : '';
  console.log(chalk.blue(`Finding items with owners on ${chainConfig.name}${blockInfo}...`));

  const client = new GraphQLClient(chainConfig.subgraphEndpoint);
  const allItemIds: string[] = [];
  let hasMore = true;
  let skip = 0;
  const first = 1000; // Maximum allowed by most subgraphs

  while (hasMore) {
    try {
      const blockParam = chainConfig.blockNumber
        ? `, block: { number: ${chainConfig.blockNumber} }`
        : '';
      const query = gql`
        {
          itemTypes(first: ${first}, skip: ${skip}, orderBy: id, orderDirection: asc, where: { owners_: {} }${blockParam}) {
            id
          }
        }
      `;

      const response: { itemTypes: { id: string }[] } = await client.request(query);

      if (response.itemTypes.length === 0) {
        hasMore = false;
      } else {
        const itemIds = response.itemTypes.map(item => item.id);
        allItemIds.push(...itemIds);
        skip += first;
        console.log(
          `  Found ${itemIds.length} items with owners (total: ${allItemIds.length}, skip: ${skip})`
        );

        // If we got fewer items than requested, we've reached the end
        if (response.itemTypes.length < first) {
          hasMore = false;
        } else {
          // Rate limiting
          await delay(REQUEST_DELAY);
        }
      }
    } catch (error) {
      console.error(chalk.red(`Error fetching items with owners at skip ${skip}:`), error);
      hasMore = false;
    }
  }

  // Sort item IDs numerically (they come as strings from subgraph)
  const sortedItemIds = allItemIds.sort((a, b) => parseInt(a) - parseInt(b));

  console.log(chalk.green(`✓ Total items with owners found: ${sortedItemIds.length}`));
  return sortedItemIds;
}

function compareChainResults(
  polygonAnalyses: ItemAnalysis[],
  baseSepoliaAnalyses: ItemAnalysis[]
): ComparisonResult {
  const discrepancies: CrossChainDiscrepancy[] = [];
  const timestamp = new Date().toISOString();

  // Create maps for easier lookup - using CONTRACT BALANCES ONLY
  const polygonContractBalancesByItem = new Map<string, Map<string, string>>();
  const baseSepoliaContractBalancesByItem = new Map<string, Map<string, string>>();

  // Build maps of contract balances by item ID
  for (const analysis of polygonAnalyses) {
    const balanceMap = new Map<string, string>();
    for (const owner of analysis.owners) {
      // Only use contract balance, ignore subgraph balance
      if (owner.contractBalance !== 'ERROR') {
        const contractBalance = owner.contractBalance;
        // Only store if contract balance > 0
        if (parseInt(contractBalance) > 0) {
          balanceMap.set(owner.address.toLowerCase(), contractBalance);
        }
      }
    }
    polygonContractBalancesByItem.set(analysis.itemId, balanceMap);
  }

  for (const analysis of baseSepoliaAnalyses) {
    const balanceMap = new Map<string, string>();
    for (const owner of analysis.owners) {
      // Only use contract balance, ignore subgraph balance
      if (owner.contractBalance !== 'ERROR') {
        const contractBalance = owner.contractBalance;
        // Only store if contract balance > 0
        if (parseInt(contractBalance) > 0) {
          balanceMap.set(owner.address.toLowerCase(), contractBalance);
        }
      }
    }
    baseSepoliaContractBalancesByItem.set(analysis.itemId, balanceMap);
  }

  // Find all unique item IDs across both chains
  const allItemIds = new Set([
    ...polygonContractBalancesByItem.keys(),
    ...baseSepoliaContractBalancesByItem.keys(),
  ]);

  for (const itemId of allItemIds) {
    const polygonBalances = polygonContractBalancesByItem.get(itemId) || new Map();
    const baseSepoliaBalances = baseSepoliaContractBalancesByItem.get(itemId) || new Map();

    // Find all unique addresses for this item across both chains
    const allAddresses = new Set([...polygonBalances.keys(), ...baseSepoliaBalances.keys()]);

    for (const address of allAddresses) {
      // Skip excluded addresses
      if (isAddressExcluded(address)) continue;

      const polygonBalance = polygonBalances.get(address) || '0';
      const baseSepoliaBalance = baseSepoliaBalances.get(address) || '0';

      // Only report discrepancies where balances differ
      if (polygonBalance !== baseSepoliaBalance) {
        let discrepancyType: 'polygon_only' | 'base_sepolia_only' | 'balance_mismatch';

        if (polygonBalance === '0') {
          discrepancyType = 'base_sepolia_only';
        } else if (baseSepoliaBalance === '0') {
          discrepancyType = 'polygon_only';
        } else {
          discrepancyType = 'balance_mismatch';
        }

        discrepancies.push({
          itemId,
          address,
          polygonBalance,
          baseSepoliaBalance,
          discrepancyType,
        });
      }
    }
  }

  // Calculate breakdown
  const breakdown = {
    polygonOnly: discrepancies.filter(d => d.discrepancyType === 'polygon_only').length,
    baseSepoliaOnly: discrepancies.filter(d => d.discrepancyType === 'base_sepolia_only').length,
    balanceMismatch: discrepancies.filter(d => d.discrepancyType === 'balance_mismatch').length,
  };

  // Calculate chain-specific data
  const allPolygonOwners = new Set<string>();
  const allBaseSepoliaOwners = new Set<string>();

  // Collect all unique owners from each chain
  for (const analysis of polygonAnalyses) {
    for (const owner of analysis.owners) {
      allPolygonOwners.add(owner.address.toLowerCase());
    }
  }

  for (const analysis of baseSepoliaAnalyses) {
    for (const owner of analysis.owners) {
      allBaseSepoliaOwners.add(owner.address.toLowerCase());
    }
  }

  // Calculate unique owners (exist on only one chain)
  const polygonUniqueOwners = new Set(
    [...allPolygonOwners].filter(addr => !allBaseSepoliaOwners.has(addr))
  );
  const baseSepoliaUniqueOwners = new Set(
    [...allBaseSepoliaOwners].filter(addr => !allPolygonOwners.has(addr))
  );

  const chainSpecificData = {
    polygon: {
      totalItems: polygonAnalyses.length,
      totalOwners: allPolygonOwners.size,
      uniqueOwners: polygonUniqueOwners.size,
    },
    baseSepolia: {
      totalItems: baseSepoliaAnalyses.length,
      totalOwners: allBaseSepoliaOwners.size,
      uniqueOwners: baseSepoliaUniqueOwners.size,
    },
  };

  return {
    timestamp,
    totalItemsCompared: allItemIds.size,
    totalDiscrepancies: discrepancies.length,
    discrepancyBreakdown: breakdown,
    chainSpecificData,
    discrepancies,
  };
}

async function saveComparisonResults(comparisonResult: ComparisonResult): Promise<void> {
  const fs = await import('fs').then(m => m.promises);
  const path = await import('path');

  // Create the directory structure if it doesn't exist
  const resultsDir = 'data/results/wearables';
  await fs.mkdir(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `wearables-comparison-${timestamp}.json`;
  const filepath = path.join(resultsDir, filename);

  await fs.writeFile(filepath, JSON.stringify(comparisonResult, null, 2));
  console.log(chalk.green(`\n💾 Comparison results saved to: ${filepath}`));
}

async function analyzeAllWearables(): Promise<void> {
  console.log(chalk.cyan.bold('🚀 Starting Cross-Chain Wearables Comparison\n'));
  console.log(chalk.blue('📝 Note: Subgraph is used only to discover owner addresses.'));
  console.log(chalk.blue('📊 Comparison is based exclusively on contract balances.\n'));

  try {
    validateEnvironment();
    const chains = getChainConfigs();
    const analysesByChain = new Map<string, ItemAnalysis[]>();

    // Analyze each chain
    for (const chainConfig of chains) {
      console.log(chalk.magenta.bold(`\n🔗 Analyzing ${chainConfig.name}\n`));

      const chainAnalyses: ItemAnalysis[] = [];

      // Find all items that have owners on this chain
      const itemIds = await findItemsWithOwners(chainConfig);

      // Analyze each item that has owners
      for (const itemId of itemIds) {
        try {
          const analysis = await analyzeItem(chainConfig, itemId);
          chainAnalyses.push(analysis);

          // Add delay between items to avoid overwhelming the provider
          await delay(REQUEST_DELAY);
        } catch (error) {
          console.error(
            chalk.red(`Failed to analyze item ${itemId} on ${chainConfig.name}:`),
            error
          );
        }
      }

      analysesByChain.set(chainConfig.name, chainAnalyses);

      // Add longer delay between chains
      await delay(CONTRACT_CALL_DELAY * 2);
    }

    // Print individual chain summaries
    const allAnalyses: ItemAnalysis[] = [];
    for (const [chainName, analyses] of analysesByChain) {
      allAnalyses.push(...analyses);
      console.log(chalk.yellow.bold(`\n📊 ${chainName} Individual Summary:`));
      printChainSummary(analyses);
    }

    // Perform cross-chain comparison
    const polygonAnalyses = analysesByChain.get('Polygon') || [];
    const baseSepoliaAnalyses = analysesByChain.get('Base Sepolia') || [];

    console.log(chalk.cyan.bold('\n🔄 Performing Cross-Chain Comparison...\n'));
    const comparisonResult = compareChainResults(polygonAnalyses, baseSepoliaAnalyses);

    // Save comparison results to JSON
    await saveComparisonResults(comparisonResult);

    // Print comparison summary
    printComparisonSummary(comparisonResult);
  } catch (error) {
    console.error(chalk.red('Fatal error during analysis:'), error);
  }
}

function printChainSummary(analyses: ItemAnalysis[]): void {
  const totalItems = analyses.length;
  const itemsWithOwners = analyses.filter(a => a.totalSubgraphOwners > 0).length;
  const totalSubgraphAddresses = analyses.reduce((sum, a) => sum + a.totalSubgraphOwners, 0);
  const totalContractOwners = analyses.reduce((sum, a) => sum + a.totalContractOwners, 0);
  const totalErrors = analyses.reduce((sum, a) => sum + a.errors, 0);

  console.log(`  Total items analyzed: ${totalItems}`);
  console.log(`  Items with addresses found: ${itemsWithOwners}`);
  console.log(`  Total addresses from subgraph: ${totalSubgraphAddresses}`);
  console.log(`  Total contract owners with balance > 0: ${chalk.green(totalContractOwners)}`);
  console.log(`  Errors: ${chalk.red(totalErrors)}`);
}

function printComparisonSummary(comparisonResult: ComparisonResult): void {
  console.log(chalk.cyan.bold('\n🎯 CROSS-CHAIN COMPARISON SUMMARY'));
  console.log('='.repeat(60));
  console.log(
    chalk.blue('📊 Contract balances comparison (subgraph used only for address discovery)')
  );

  console.log(`Timestamp: ${comparisonResult.timestamp}`);
  console.log(`Total items compared: ${comparisonResult.totalItemsCompared}`);
  console.log(`Total discrepancies found: ${chalk.red(comparisonResult.totalDiscrepancies)}`);

  console.log('\nChain-Specific Data:');
  console.log(`  Polygon:`);
  console.log(`    Total items: ${comparisonResult.chainSpecificData.polygon.totalItems}`);
  console.log(`    Total owners: ${comparisonResult.chainSpecificData.polygon.totalOwners}`);
  console.log(
    `    Unique owners (Polygon only): ${chalk.yellow(comparisonResult.chainSpecificData.polygon.uniqueOwners)}`
  );
  console.log(`  Base Sepolia:`);
  console.log(`    Total items: ${comparisonResult.chainSpecificData.baseSepolia.totalItems}`);
  console.log(`    Total owners: ${comparisonResult.chainSpecificData.baseSepolia.totalOwners}`);
  console.log(
    `    Unique owners (Base Sepolia only): ${chalk.blue(comparisonResult.chainSpecificData.baseSepolia.uniqueOwners)}`
  );

  console.log('\nDiscrepancy Breakdown:');
  console.log(`  Polygon only: ${chalk.yellow(comparisonResult.discrepancyBreakdown.polygonOnly)}`);
  console.log(
    `  Base Sepolia only: ${chalk.blue(comparisonResult.discrepancyBreakdown.baseSepoliaOnly)}`
  );
  console.log(
    `  Balance mismatches: ${chalk.red(comparisonResult.discrepancyBreakdown.balanceMismatch)}`
  );

  if (comparisonResult.totalDiscrepancies > 0) {
    console.log('\nTop 10 Items with Most Discrepancies:');
    const discrepanciesByItem = new Map<string, number>();

    for (const discrepancy of comparisonResult.discrepancies) {
      const current = discrepanciesByItem.get(discrepancy.itemId) || 0;
      discrepanciesByItem.set(discrepancy.itemId, current + 1);
    }

    const topItems = Array.from(discrepanciesByItem.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    for (const [itemId, count] of topItems) {
      console.log(`  Item ${itemId}: ${count} discrepancies`);
    }
  }

  const accuracy =
    comparisonResult.totalItemsCompared > 0
      ? (1 - comparisonResult.totalDiscrepancies / comparisonResult.totalItemsCompared) * 100
      : 100;
  console.log(`\nCross-chain consistency: ${accuracy.toFixed(2)}%`);
}

// Main execution
async function main() {
  try {
    await analyzeAllWearables();
  } catch (error) {
    console.error(chalk.red('Error in main execution:'), error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
