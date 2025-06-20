import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { baseSepoliaAddresses, polygonAddresses } from './chainAddresses';

// Load environment variables from .env file
dotenv.config();

// Types for Alchemy NFT API responses
interface TokenBalance {
  tokenId: string;
  balance: number;
}

interface Owner {
  ownerAddress: string;
  tokenBalances: TokenBalance[];
}

interface AlchemyOwnersResponse {
  owners: Owner[];
  pageKey?: string;
}

interface ChainConfig {
  name: string;
  alchemyEndpoint: string;
  contractAddress: string;
  maxRequests?: number;
  requestDelay?: number;
  enabled?: boolean;
  blockNumber?: string; // Block number (decimal/hex) or block tag (latest, earliest, finalized)
}

interface CollectionConfig {
  name: string;
  chains: ChainConfig[];
  apiKey: string;
}

interface OwnerComparison {
  ownerAddress: string;
  chains: {
    [chainName: string]: {
      tokenBalances: TokenBalance[];
    };
  };
  discrepancies: {
    tokenBalanceDiffs: Array<{
      tokenId: string;
      balances: { [chainName: string]: number };
    }>;
  };
}

interface ComparisonResult {
  collectionName: string;
  timestamp: string;
  summary: {
    totalOwners: { [chainName: string]: number };
    uniqueOwners: number;
    ownersWithDiscrepancies: number;
    tokenDiscrepancies: number;
    chainsCompared: string[];
  };
  discrepancies: OwnerComparison[];
  detailedReport: {
    ownersOnlyOnChain: { [chainName: string]: string[] };
  };
}

// Configuration - Single API key for all chains
const COLLECTION_CONFIG: CollectionConfig = {
  name: 'Installations',
  apiKey: process.env.ALCHEMY_API_KEY || '',
  chains: [
    {
      name: 'Polygon',
      alchemyEndpoint: 'https://polygon-mainnet.g.alchemy.com/nft/v3',
      contractAddress: polygonAddresses.installationsDiamond,
      maxRequests: 100,
      requestDelay: 100,
      enabled: true,
      blockNumber: '72386800',
      // blockNumber: '56789012', // Optional: specific block number (decimal)
      // blockNumber: '0x3618140', // Optional: specific block number (hex)
      // blockNumber: 'finalized', // Optional: block tag
    },
    {
      name: 'BaseSepolia',
      alchemyEndpoint: 'https://base-sepolia.g.alchemy.com/nft/v3',
      contractAddress: baseSepoliaAddresses.installationsDiamond,
      maxRequests: 100,
      requestDelay: 100,
      enabled: true,
      // blockNumber: '12345678', // Optional: specific block number (decimal)
      // blockNumber: '0xbc614e', // Optional: specific block number (hex)
      // blockNumber: 'latest',   // Optional: block tag
    },
  ],
};

async function fetchOwnersForContract(
  config: ChainConfig,
  apiKey: string,
  collectionName: string
): Promise<Owner[]> {
  const allOwners: Owner[] = [];
  let pageKey: string | undefined;
  let requestCount = 0;
  const maxRequests = config.maxRequests || 100;
  const requestDelay = config.requestDelay || 100;

  console.log(
    chalk.blue(
      `Fetching owners for ${collectionName} on ${config.name}${config.blockNumber ? ` at block ${config.blockNumber}` : ' (latest block)'}...`
    )
  );

  do {
    if (requestCount >= maxRequests) {
      console.warn(
        chalk.yellow(`Warning: Reached maximum request limit (${maxRequests}) for ${config.name}`)
      );
      break;
    }

    const url = new URL(`${config.alchemyEndpoint}/${apiKey}/getOwnersForContract`);
    url.searchParams.append('contractAddress', config.contractAddress);
    url.searchParams.append('withTokenBalances', 'true');

    if (pageKey) {
      url.searchParams.append('pageKey', pageKey);
    }

    // Add block parameter if specified
    if (config.blockNumber) {
      url.searchParams.append('block', config.blockNumber);
    }

    try {
      console.log(
        `  Request ${requestCount + 1} for ${config.name}${pageKey ? ` (page: ${pageKey.slice(0, 8)}...)` : ''}`
      );

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: AlchemyOwnersResponse = await response.json();

      if (data.owners && data.owners.length > 0) {
        // Filter out zero address (0x0000000000000000000000000000000000000000)
        const filteredOwners = data.owners.filter(
          owner => owner.ownerAddress.toLowerCase() !== '0x0000000000000000000000000000000000000000'
        );
        allOwners.push(...filteredOwners);
        console.log(
          `  Fetched ${data.owners.length} owners (${filteredOwners.length} after filtering zero address). Total so far: ${allOwners.length}`
        );
      }

      pageKey = data.pageKey;
      requestCount++;

      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, requestDelay));
    } catch (error) {
      console.error(chalk.red(`Error fetching owners for ${config.name}:`), error);
      throw error;
    }
  } while (pageKey);

  console.log(chalk.green(`✓ Total owners fetched for ${config.name}: ${allOwners.length}`));
  return allOwners;
}

async function fetchAllChainData(
  collectionConfig: CollectionConfig
): Promise<{ [chainName: string]: Owner[] }> {
  const results: { [chainName: string]: Owner[] } = {};

  console.log(
    chalk.cyan.bold(
      `🔗 Starting to fetch data for "${collectionConfig.name}" across all chains...\n`
    )
  );

  // Get active chains
  const activeChains = collectionConfig.chains.filter(config => config.enabled);

  if (!collectionConfig.apiKey) {
    throw new Error(
      'API key is required. Please set ALCHEMY_API_KEY in your environment variables.'
    );
  }

  for (const config of activeChains) {
    try {
      results[config.name] = await fetchOwnersForContract(
        config,
        collectionConfig.apiKey,
        collectionConfig.name
      );
    } catch (error) {
      console.error(chalk.red(`Failed to fetch data for ${config.name}:`), error);
      results[config.name] = [];
    }

    console.log(); // Add spacing between chains
  }

  return results;
}

function compareOwnershipData(
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

    const ownerComparison: OwnerComparison = {
      ownerAddress: address,
      chains: {},
      discrepancies: {
        tokenBalanceDiffs: [],
      },
    };

    // Owner only on chain 1
    if (owner1 && !owner2) {
      ownerComparison.chains[chain1Name] = {
        tokenBalances: owner1.tokenBalances,
      };
      ownersOnlyOnChain[chain1Name].push(address);
      discrepancies.push(ownerComparison);
      return;
    }

    // Owner only on chain 2
    if (owner2 && !owner1) {
      ownerComparison.chains[chain2Name] = {
        tokenBalances: owner2.tokenBalances,
      };
      ownersOnlyOnChain[chain2Name].push(address);
      discrepancies.push(ownerComparison);
      return;
    }

    // Owner exists on both chains - compare balances
    if (owner1 && owner2) {
      ownerComparison.chains[chain1Name] = {
        tokenBalances: owner1.tokenBalances,
      };
      ownerComparison.chains[chain2Name] = {
        tokenBalances: owner2.tokenBalances,
      };

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

      // tokenBalanceDiffs already contains only actual differences

      ownerComparison.discrepancies = {
        tokenBalanceDiffs,
      };

      // Only include in discrepancies if there are actual differences
      if (tokenBalanceDiffs.length > 0) {
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

function printResults(result: ComparisonResult): void {
  console.log(chalk.cyan.bold(`\n🔍 CROSS-CHAIN OWNERSHIP COMPARISON RESULTS`));
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
    const chainExclusiveOwners = result.discrepancies.filter(
      owner => Object.keys(owner.chains).length === 1
    );
    const balanceDiscrepancyOwners = result.discrepancies.filter(
      owner =>
        Object.keys(owner.chains).length === 2 && owner.discrepancies.tokenBalanceDiffs.length > 0
    );

    console.log(`${chalk.cyan('Chain-exclusive owners:')} ${chainExclusiveOwners.length}`);
    console.log(`${chalk.cyan('Balance discrepancy owners:')} ${balanceDiscrepancyOwners.length}`);

    // Show balance discrepancies first (these are more interesting)
    if (balanceDiscrepancyOwners.length > 0) {
      console.log(chalk.yellow.bold('\n📊 BALANCE DISCREPANCIES:'));
      const topBalanceDiscrepancies = balanceDiscrepancyOwners.slice(0, 15);

      topBalanceDiscrepancies.forEach((owner, index) => {
        console.log(`\n${chalk.red(`${index + 1}. ${owner.ownerAddress}`)}`);

        Object.entries(owner.chains).forEach(([chain, data]) => {
          const totalBalance = data.tokenBalances.reduce((sum, tb) => sum + tb.balance, 0);
          console.log(
            `  ${chalk.blue(chain)}: ${totalBalance} total tokens (${data.tokenBalances.length} different token IDs)`
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

async function saveResults(result: ComparisonResult): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sanitizedCollectionName = result.collectionName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const filename = `${sanitizedCollectionName}-comparison-${timestamp}.json`;
  const filePath = path.join(process.cwd(), 'data/results', filename);

  try {
    // Ensure data directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    await fs.writeFile(filePath, JSON.stringify(result, null, 2));
    console.log(chalk.green(`\n💾 Results saved to: ${filePath}`));
  } catch (error) {
    console.error(chalk.red('Failed to save results:'), error);
  }
}

async function main(): Promise<void> {
  try {
    console.log(chalk.cyan.bold('🚀 Starting Cross-Chain NFT Ownership Comparison\n'));

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

    // Compare the data
    const result = compareOwnershipData(chainData, COLLECTION_CONFIG.name);

    // Print results
    printResults(result);

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

export { main, compareOwnershipData, fetchOwnersForContract, CollectionConfig, ComparisonResult };
