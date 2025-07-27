import { GraphQLClient, gql } from 'graphql-request';
import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import {
  polygonAddresses,
  baseAddresses,
} from '../erc1155-cross-chain-comparison/lib/chainAddresses';
import { ownerContractAddressesOnPolygon } from '../lib';

dotenv.config();

const subgraphEndpoint = `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-matic/version/matic-add-owners-to-wearables-6/api`;
const baseEndpoint = `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-base/api`;

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
  equippedWearablesCount?: string; // For Aavegotchi Diamond addresses, count of equipped wearables
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
  baseBalance: string;
  discrepancyType: 'polygon_only' | 'base_only' | 'balance_mismatch';
}

interface ItemDiscrepancyGroup {
  itemId: string;
  polygonTotalOwners: number;
  baseTotalOwners: number;
  polygonTotalBalance: string;
  baseTotalBalance: string;
  discrepancies: Omit<CrossChainDiscrepancy, 'itemId'>[];
}

interface ChainSpecificData {
  totalItems: number;
  totalOwners: number;
  uniqueOwners: number; // Owners that exist only on this chain
  uniqueOwnerAddresses: string[]; // Actual addresses that exist only on this chain
}

interface ItemBalanceComparison {
  itemId: string;
  polygonTotalOwners: number;
  baseTotalOwners: number;
  polygonTotalBalance: string;
  baseTotalBalance: string;
  balancesMatch: boolean;
}

interface AavegotchiDiamondComparison {
  itemId: string;
  polygonContractBalance: string;
  baseContractBalance: string;
  contractBalancesMatch: boolean;
  polygonEquippedCount: string;
  baseEquippedCount: string;
  equippedCountsMatch: boolean;
  missingAavegotchiIds: {
    missingFromBase: string[]; // Aavegotchi IDs that have this item equipped on Polygon but not on Base
    missingFromPolygon: string[]; // Aavegotchi IDs that have this item equipped on Base but not on Polygon
  };
}

interface ComparisonResult {
  timestamp: string;
  totalItemsCompared: number;
  totalDiscrepancies: number;
  discrepancyBreakdown: {
    polygonOnly: number;
    baseOnly: number;
    balanceMismatch: number;
  };
  chainSpecificData: {
    polygon: ChainSpecificData;
    base: ChainSpecificData;
  };
  missingItems: {
    missingFromBase: string[]; // Items that exist on Polygon but not on Base
    missingFromPolygon: string[]; // Items that exist on Base but not on Polygon
  };
  itemBalanceComparisons: { [itemId: string]: ItemBalanceComparison }; // Only items with balance discrepancies
  discrepanciesByItem: { [itemId: string]: ItemDiscrepancyGroup };
  aavegotchiDiamondComparisons: { [itemId: string]: AavegotchiDiamondComparison };
}

const ERC1155_ABI = [
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
  'function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids) external view returns (uint256[] memory)',
];

// Provider pool to reuse connections and avoid "failed to detect network" issues
const providerPool = new Map<string, ethers.JsonRpcProvider>();

function getProvider(rpcUrl: string): ethers.JsonRpcProvider {
  if (!providerPool.has(rpcUrl)) {
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      staticNetwork: true, // Avoid network detection on each call
    });
    providerPool.set(rpcUrl, provider);
  }
  return providerPool.get(rpcUrl)!;
}

const BATCH_SIZE = 50;
const REQUEST_DELAY = 250; // 250ms between requests to avoid rate limiting
const CONTRACT_CALL_DELAY = 500; // 500ms between contract calls
const MAX_RETRIES = 3; // Maximum number of retries for failed requests
const RETRY_BASE_DELAY = 1000; // Base delay for exponential backoff (1 second)

// Create a set of addresses to exclude from comparison
export const EXCLUDED_ADDRESSES = new Set([
  // Zero address
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dead',

  // Polygon contract addresses
  polygonAddresses.realmDiamond.toLowerCase(),
  polygonAddresses.installationsDiamond.toLowerCase(),
  polygonAddresses.tilesDiamond.toLowerCase(),
  // polygonAddresses.aavegotchiDiamond.toLowerCase(),
  polygonAddresses.wearableDiamond.toLowerCase(),
  polygonAddresses.forgeDiamond.toLowerCase(),
  polygonAddresses.gbmDiamond.toLowerCase(),
  polygonAddresses.treasury.toLowerCase(),
  polygonAddresses.maticBurnAddress.toLowerCase(),

  // Base contract addresses
  // baseAddresses.realmDiamond.toLowerCase(),
  // baseAddresses.installationsDiamond.toLowerCase(),
  // baseAddresses.tilesDiamond.toLowerCase(),
  // baseAddresses.aavegotchiDiamond.toLowerCase(),
  baseAddresses.wearableDiamond.toLowerCase(),
  baseAddresses.forgeDiamond.toLowerCase(),
  // baseAddresses.gbmDiamond.toLowerCase(),
  // baseAddresses.guardianSkinsDiamond.toLowerCase(),

  // Owner contract addresses from Polygon
  ...ownerContractAddressesOnPolygon.map(addr => addr.toLowerCase()),

  '0x01F010a5e001fe9d6940758EA5e8c777885E351e'.toLowerCase(),

  // failedSafe deployments
  '0xaa2a5d382fb27e73b52c78aeb738a8edeb9eb6de',
  '0x137c0f7d6b2558edf5b8f69eec0635dd43fad6af',
  '0x0681320ba86457f686cb0a0e664ad23c8ab77ec0',
  '0x55217dfc9146d3d02d07af11a056b8baffe7aaaf',

  // EOA contracts

  '0xe12986643fc9066350802bf33431cf7ffbd162c9',
  '0x6759eed797ffaaca7edfc5bd74e7839f1ed0fba4',
  '0x099d24fc4923fa9e122a6ac7264e497c4a2f05fe',
  '0x3a120fdd1260422fc76cb5c7e9b5e6f292c96b56',
  '0xef6303983e968c5202f582daa9f36f3864e21c71',
  '0x8a184d2f79d955bb2656860a2cc1dae91baf929a',
  '0x7963fbd04523ed0d995bbbb3132aed448fc22869',
  '0x5d6013a802e7e29e60a46492d5eccf0b5da75735',
  '0xc6076f8d619f4386e04c97ba49242fe8068c3eb8',
  '0x5fa7d69bdad5d5e88ad351a7626d00508885c723',
  '0x44dde9695027ca6acb7cdf3b361c37056122e4af',
  '0x3d3bef5f85a667e0b28db33668ce1929089e5e1a',
  '0xfe793d34d6d6ff83b0e5dc4cc0c530ac366a9633',
  '0xa44f424450fcfd5ffabdebba25c46c27f9c6e470',
  '0x381e41032f033440e613446792200bd6b8e527cf',
  '0xc3de23dc565df629f1422f7db0e5504d21f4fd65',
  '0xa35b52835dc644444881dd51563d13ad987c148c',
  '0x6dc899ae3c70f0a70deacb59a3a109608e24a6a1',
  '0xa421ed8a4e3cfbfbfd2f621b27bd3c27d71c8b97',
  '0x5ed1383c2c9b77acab1b56405f6790a6db7c4219',
  '0xd21b6be983de312682a503db470584c4b616d166',
  '0xc7748db7338cc106aeb041b59965d0101eda8636',
  '0x41c65e4f7e1b71767e0f3262fed89e723829c1a6',
  '0xe86b827c00848c6ac7afc02ae5f83ef43eac9abd',
  '0x1d86852b823775267ee60d98cbcda9e8d5c2faa7',
  '0x8a07289e9ffe54f7305875518902efb565d6a207',
  '0xa44c8e0ecaefe668947154ee2b803bd4e6310efe',
  '0x75c8866f47293636f1c32ecbcd9168857dbefc56',
  '0xe3fcdf310d542eac528ab3683f477010a00a9c6a',
  '0xa3ee89bef93c68b39d404282e2d894cef52b99b1',
  '0xfe4b96f1860c5a2a09cd4bd5c341632c9e9486e6',
  '0xdb70c9bada606065f3e97f6a5f71a5563ff47a9c',
  '0x085b40116bc8d7f9d8119ae381e2dbe81369c02b',
]);

function validateEnvironment(): void {
  if (!process.env.SUBGRAPH_KEY) {
    throw new Error('SUBGRAPH_KEY environment variable is required');
  }

  if (!process.env.POLYGON_RPC_URL) {
    throw new Error('POLYGON_RPC_URL environment variable is required');
  }

  if (!process.env.BASE_RPC_URL) {
    throw new Error('BASE_RPC_URL environment variable is required');
  }
}

function getChainConfigs(): ChainConfig[] {
  return [
    {
      name: 'Polygon',
      subgraphEndpoint,
      rpcUrl: process.env.POLYGON_RPC_URL!,
      contractAddress: polygonAddresses.aavegotchiDiamond,
      blockNumber: 74262598, // Set manually if needed: e.g., 50000000
    },
    {
      name: 'Base',
      subgraphEndpoint: baseEndpoint, // Not used - we'll use Polygon owners for both chains
      rpcUrl: process.env.BASE_RPC_URL!,
      contractAddress: baseAddresses.wearableDiamond,
      blockNumber: undefined, // Set manually if needed: e.g., 10000000
    },
  ];
}

function isAddressExcluded(address: string): boolean {
  // Never exclude Aavegotchi Diamond addresses, even if they appear in other exclusion lists
  if (isAavegotchiDiamond(address)) {
    return false;
  }
  return EXCLUDED_ADDRESSES.has(address.toLowerCase());
}

function isAavegotchiDiamond(address: string): boolean {
  const lowerAddress = address.toLowerCase();
  return (
    lowerAddress === polygonAddresses.aavegotchiDiamond.toLowerCase() ||
    lowerAddress === baseAddresses.aavegotchiDiamond.toLowerCase()
  );
}

function getEffectiveBalance(owner: OwnerBalance): string {
  // For Aavegotchi Diamond addresses, add equipped wearables count to contract balance
  // For other addresses, use only contract balance
  if (isAavegotchiDiamond(owner.address) && owner.equippedWearablesCount) {
    const contractBalance = parseInt(owner.contractBalance) || 0;
    const equippedCount = parseInt(owner.equippedWearablesCount) || 0;
    return (contractBalance + equippedCount).toString();
  }
  return owner.contractBalance;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  baseDelay: number = RETRY_BASE_DELAY,
  operationName: string = 'operation'
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        console.error(
          chalk.red(
            `❌ ${operationName} failed after ${maxRetries + 1} attempts:`,
            lastError.message
          )
        );
        throw lastError;
      }

      // Calculate exponential backoff delay
      const delayMs = baseDelay * Math.pow(2, attempt);
      console.log(
        chalk.yellow(
          `⚠️  ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms...`
        )
      );
      console.log(chalk.gray(`   Error: ${lastError.message}`));

      await delay(delayMs);
    }
  }

  throw lastError!;
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
  return await retryWithBackoff(
    async () => {
      const provider = getProvider(chainConfig.rpcUrl);
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
    },
    MAX_RETRIES,
    RETRY_BASE_DELAY,
    `Contract balance batch check for item ${itemId} on ${chainConfig.name}`
  );
}

async function fetchEquippedWearablesCount(
  chainConfig: ChainConfig,
  itemId: string
): Promise<{ count: number; aavegotchiIds: string[] }> {
  const client = new GraphQLClient(chainConfig.subgraphEndpoint);
  let totalCount = 0;
  const aavegotchiIds: string[] = [];
  let hasMore = true;
  let skip = 0;
  const first = 1000; // Maximum allowed by most subgraphs

  const blockInfo = chainConfig.blockNumber ? ` at block ${chainConfig.blockNumber}` : '';
  console.log(
    chalk.blue(
      `Fetching equipped wearables count for item ID: ${itemId} on ${chainConfig.name}${blockInfo}`
    )
  );

  while (hasMore) {
    try {
      const blockParam = chainConfig.blockNumber
        ? `, block: { number: ${chainConfig.blockNumber} }`
        : '';
      const query = gql`
        {
          aavegotchis(first: ${first}, skip: ${skip}, orderBy: id, orderDirection: asc, where: { equippedWearables_contains: [${itemId}] }${blockParam}) {
            id
            equippedWearables
          }
        }
      `;

      const response: { aavegotchis: { id: string; equippedWearables: string[] }[] } =
        await client.request(query);

      if (response.aavegotchis.length === 0) {
        hasMore = false;
      } else {
        // Count how many times this itemId appears in equipped wearables and collect Aavegotchi IDs
        for (const aavegotchi of response.aavegotchis) {
          const count = aavegotchi.equippedWearables.filter(id => id == itemId).length;
          totalCount += count;
          // Add the Aavegotchi ID to our list (each ID should only appear once even if they have multiple of the same item)
          if (count > 0 && !aavegotchiIds.includes(aavegotchi.id)) {
            aavegotchiIds.push(aavegotchi.id);
          }
        }

        skip += first;
        console.log(
          `  Processed ${response.aavegotchis.length} aavegotchis (total equipped count so far: ${totalCount}, unique aavegotchis: ${aavegotchiIds.length}, skip: ${skip})`
        );

        // If we got fewer items than requested, we've reached the end
        if (response.aavegotchis.length < first) {
          hasMore = false;
        } else {
          // Rate limiting
          await delay(REQUEST_DELAY);
        }
      }
    } catch (error) {
      console.error(
        chalk.red(
          `Error fetching equipped wearables for item ${itemId} on ${chainConfig.name} at skip ${skip}:`
        ),
        error
      );
      hasMore = false;
    }
  }

  // Sort Aavegotchi IDs numerically
  aavegotchiIds.sort((a, b) => parseInt(a) - parseInt(b));

  console.log(
    chalk.green(
      `✓ Total equipped count for item ${itemId} on ${chainConfig.name}: ${totalCount} (${aavegotchiIds.length} unique aavegotchis)`
    )
  );
  return { count: totalCount, aavegotchiIds };
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

  return await analyzeItemWithOwners(chainConfig, itemId, subgraphOwners);
}

async function analyzeItemWithOwners(
  chainConfig: ChainConfig,
  itemId: string,
  subgraphOwners: Owner[]
): Promise<ItemAnalysis> {
  const blockInfo = chainConfig.blockNumber ? ` at block ${chainConfig.blockNumber}` : '';
  console.log(
    chalk.blue(
      `📊 Checking contract balances for item ${itemId} on ${chainConfig.name}${blockInfo} (${subgraphOwners.length} addresses)`
    )
  );

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

  // Fetch equipped wearables count for Aavegotchi Diamond
  let equippedWearablesCount = 0;
  const hasDiamondOwner = subgraphOwners.some(owner =>
    isAavegotchiDiamond(owner.owner.toLowerCase())
  );

  if (hasDiamondOwner) {
    try {
      const equippedData = await fetchEquippedWearablesCount(chainConfig, itemId);
      equippedWearablesCount = equippedData.count;
    } catch (error) {
      console.error(
        chalk.red(`Error fetching equipped wearables count for item ${itemId}:`),
        error
      );
    }
  }

  const ownerBalances: OwnerBalance[] = [];
  let errors = 0;

  // Process owners in batches to avoid rate limiting
  for (let i = 0; i < subgraphOwners.length; i += BATCH_SIZE) {
    const batch = subgraphOwners.slice(i, i + BATCH_SIZE);
    // Use original addresses from each chain's own subgraph (no mapping needed here)
    const addresses = batch.map(owner => owner.owner.toLowerCase());

    try {
      // Use batch call for efficiency
      const contractBalances = await checkContractBalancesBatch(chainConfig, addresses, itemId);

      for (let j = 0; j < batch.length; j++) {
        const owner = batch[j];
        const ownerAddress = addresses[j]; // Use the original address (lowercased)
        const contractBalance = contractBalances[j];
        const subgraphBalance = owner.balance;

        // Use contract balance for all addresses, including Aavegotchi Diamond
        const shouldInclude = parseInt(contractBalance) > 0;

        // Only store addresses that should be included and are not excluded
        if (shouldInclude && !isAddressExcluded(ownerAddress)) {
          const ownerBalance: OwnerBalance = {
            address: ownerAddress, // Store the original address from this chain
            contractBalance,
          };

          // Add equipped wearables count for Aavegotchi Diamond addresses
          if (isAavegotchiDiamond(ownerAddress)) {
            ownerBalance.equippedWearablesCount = equippedWearablesCount.toString();
            console.log(
              `    🔷 Aavegotchi Diamond detected: ${ownerAddress} - Contract balance: ${contractBalance}, Equipped count: ${equippedWearablesCount}`
            );
          }

          ownerBalances.push(ownerBalance);
        }
      }

      console.log(
        `  Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(subgraphOwners.length / BATCH_SIZE)} on ${chainConfig.name}`
      );

      // Rate limiting between batches
      if (i + BATCH_SIZE < subgraphOwners.length) {
        await delay(CONTRACT_CALL_DELAY);
      }
    } catch (error) {
      console.error(
        chalk.red(`Error processing batch starting at index ${i} on ${chainConfig.name}:`),
        error
      );
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

function mapAddressForComparison(address: string, fromChain: string, toChain: string): string {
  const lowerAddress = address.toLowerCase();

  // Map Aavegotchi Diamond addresses between chains
  if (fromChain === 'Polygon' && toChain === 'Base') {
    if (lowerAddress === polygonAddresses.aavegotchiDiamond.toLowerCase()) {
      return baseAddresses.aavegotchiDiamond.toLowerCase();
    }
  } else if (fromChain === 'Base' && toChain === 'Polygon') {
    if (lowerAddress === baseAddresses.aavegotchiDiamond.toLowerCase()) {
      return polygonAddresses.aavegotchiDiamond.toLowerCase();
    }
  }

  // Return original address if no mapping needed
  return lowerAddress;
}

async function compareChainResults(
  polygonAnalyses: ItemAnalysis[],
  baseAnalyses: ItemAnalysis[],
  polygonConfig: ChainConfig,
  baseConfig: ChainConfig
): Promise<ComparisonResult> {
  const discrepanciesByItem: { [itemId: string]: ItemDiscrepancyGroup } = {};
  const itemBalanceComparisons: { [itemId: string]: ItemBalanceComparison } = {};
  const aavegotchiDiamondComparisons: { [itemId: string]: AavegotchiDiamondComparison } = {};
  const timestamp = new Date().toISOString();

  // Create maps for easier lookup - using EFFECTIVE BALANCES (contract + equipped count for Aavegotchi Diamond, contract only for others)
  const polygonBalancesByItem = new Map<string, Map<string, string>>();
  const baseBalancesByItem = new Map<string, Map<string, string>>();
  const polygonAnalysisByItem = new Map<string, ItemAnalysis>();
  const baseAnalysisByItem = new Map<string, ItemAnalysis>();

  // Build maps of effective balances by item ID and store analyses
  for (const analysis of polygonAnalyses) {
    const balanceMap = new Map<string, string>();
    for (const owner of analysis.owners) {
      if (owner.contractBalance !== 'ERROR') {
        const effectiveBalance = getEffectiveBalance(owner);
        // Only store if effective balance > 0
        if (parseInt(effectiveBalance) > 0) {
          balanceMap.set(owner.address.toLowerCase(), effectiveBalance);
        }
      }
    }
    polygonBalancesByItem.set(analysis.itemId, balanceMap);
    polygonAnalysisByItem.set(analysis.itemId, analysis);
  }

  for (const analysis of baseAnalyses) {
    const balanceMap = new Map<string, string>();
    for (const owner of analysis.owners) {
      if (owner.contractBalance !== 'ERROR') {
        const effectiveBalance = getEffectiveBalance(owner);
        // Only store if effective balance > 0
        if (parseInt(effectiveBalance) > 0) {
          balanceMap.set(owner.address.toLowerCase(), effectiveBalance);
        }
      }
    }
    baseBalancesByItem.set(analysis.itemId, balanceMap);
    baseAnalysisByItem.set(analysis.itemId, analysis);
  }

  // Find all unique item IDs across both chains
  const allItemIds = new Set([...polygonBalancesByItem.keys(), ...baseBalancesByItem.keys()]);

  for (const itemId of allItemIds) {
    const polygonBalances = polygonBalancesByItem.get(itemId) || new Map();
    const baseBalances = baseBalancesByItem.get(itemId) || new Map();
    const polygonAnalysis = polygonAnalysisByItem.get(itemId);
    const baseAnalysis = baseAnalysisByItem.get(itemId);

    const itemDiscrepancies: Omit<CrossChainDiscrepancy, 'itemId'>[] = [];

    // Find all unique addresses for this item across both chains, including mapped addresses
    const allAddresses = new Set([...polygonBalances.keys(), ...baseBalances.keys()]);

    // Add mapped diamond addresses to ensure we compare them
    for (const address of polygonBalances.keys()) {
      const mappedAddress = mapAddressForComparison(address, 'Polygon', 'Base');
      if (mappedAddress !== address.toLowerCase()) {
        allAddresses.add(mappedAddress);
      }
    }
    for (const address of baseBalances.keys()) {
      const mappedAddress = mapAddressForComparison(address, 'Base', 'Polygon');
      if (mappedAddress !== address.toLowerCase()) {
        allAddresses.add(mappedAddress);
      }
    }

    for (const address of allAddresses) {
      // Skip excluded addresses
      if (isAddressExcluded(address)) continue;

      // Map addresses for cross-chain comparison (handles diamond addresses)
      const mappedAddressForBase = mapAddressForComparison(address, 'Polygon', 'Base');
      const mappedAddressForPolygon = mapAddressForComparison(address, 'Base', 'Polygon');

      const polygonBalance =
        polygonBalances.get(address) || polygonBalances.get(mappedAddressForPolygon) || '0';
      const baseBalance =
        baseBalances.get(address) || baseBalances.get(mappedAddressForBase) || '0';

      // Only report discrepancies where balances differ
      if (polygonBalance !== baseBalance) {
        let discrepancyType: 'polygon_only' | 'base_only' | 'balance_mismatch';

        if (polygonBalance === '0') {
          discrepancyType = 'base_only';
        } else if (baseBalance === '0') {
          discrepancyType = 'polygon_only';
        } else {
          discrepancyType = 'balance_mismatch';
        }

        itemDiscrepancies.push({
          address,
          polygonBalance,
          baseBalance,
          discrepancyType,
        });
      }
    }

    // Calculate total balances for this item on each chain
    const polygonTotalBalance =
      polygonAnalysis?.owners.reduce((sum, owner) => {
        const balance = parseInt(getEffectiveBalance(owner)) || 0;
        return sum + balance;
      }, 0) || 0;

    const baseTotalBalance =
      baseAnalysis?.owners.reduce((sum, owner) => {
        const balance = parseInt(getEffectiveBalance(owner)) || 0;
        return sum + balance;
      }, 0) || 0;

    // Add balance comparison only for items with discrepancies
    const balancesMatch = polygonTotalBalance.toString() === baseTotalBalance.toString();
    if (!balancesMatch) {
      itemBalanceComparisons[itemId] = {
        itemId,
        polygonTotalOwners: polygonAnalysis?.totalContractOwners || 0,
        baseTotalOwners: baseAnalysis?.totalContractOwners || 0,
        polygonTotalBalance: polygonTotalBalance.toString(),
        baseTotalBalance: baseTotalBalance.toString(),
        balancesMatch: false,
      };
    }

    // Add Aavegotchi Diamond comparison for items that have diamond owners
    const polygonDiamondOwner = polygonAnalysis?.owners.find(owner =>
      isAavegotchiDiamond(owner.address)
    );
    const baseDiamondOwner = baseAnalysis?.owners.find(owner => isAavegotchiDiamond(owner.address));

    if (polygonDiamondOwner || baseDiamondOwner) {
      const polygonContractBalance = polygonDiamondOwner?.contractBalance || '0';
      const baseContractBalance = baseDiamondOwner?.contractBalance || '0';
      const polygonEquippedCount = polygonDiamondOwner?.equippedWearablesCount || '0';
      const baseEquippedCount = baseDiamondOwner?.equippedWearablesCount || '0';

      // Fetch equipped Aavegotchi IDs for both chains to find missing ones
      let polygonAavegotchiIds: string[] = [];
      let baseAavegotchiIds: string[] = [];

      try {
        if (polygonDiamondOwner) {
          const polygonEquippedData = await fetchEquippedWearablesCount(polygonConfig, itemId);
          polygonAavegotchiIds = polygonEquippedData.aavegotchiIds;
        }

        if (baseDiamondOwner) {
          const baseEquippedData = await fetchEquippedWearablesCount(baseConfig, itemId);
          baseAavegotchiIds = baseEquippedData.aavegotchiIds;
        }
      } catch (error) {
        console.error(chalk.red(`Error fetching Aavegotchi IDs for item ${itemId}:`), error);
      }

      // Find missing Aavegotchi IDs
      const missingFromBase = polygonAavegotchiIds.filter(id => !baseAavegotchiIds.includes(id));
      const missingFromPolygon = baseAavegotchiIds.filter(id => !polygonAavegotchiIds.includes(id));

      const contractBalancesMatch = polygonContractBalance === baseContractBalance;
      const equippedCountsMatch = polygonEquippedCount === baseEquippedCount;
      const hasDiscrepancies =
        !contractBalancesMatch ||
        !equippedCountsMatch ||
        missingFromBase.length > 0 ||
        missingFromPolygon.length > 0;

      // Only include items with discrepancies
      if (hasDiscrepancies) {
        aavegotchiDiamondComparisons[itemId] = {
          itemId,
          polygonContractBalance,
          baseContractBalance,
          contractBalancesMatch,
          polygonEquippedCount,
          baseEquippedCount,
          equippedCountsMatch,
          missingAavegotchiIds: {
            missingFromBase,
            missingFromPolygon,
          },
        };
      }
    }

    // Only add to discrepanciesByItem if there are discrepancies
    if (itemDiscrepancies.length > 0) {
      discrepanciesByItem[itemId] = {
        itemId,
        polygonTotalOwners: polygonAnalysis?.totalContractOwners || 0,
        baseTotalOwners: baseAnalysis?.totalContractOwners || 0,
        polygonTotalBalance: polygonTotalBalance.toString(),
        baseTotalBalance: baseTotalBalance.toString(),
        discrepancies: itemDiscrepancies,
      };
    }
  }

  // Calculate breakdown from all discrepancies
  const allDiscrepancies = Object.values(discrepanciesByItem).flatMap(group =>
    group.discrepancies.map(d => ({ ...d, itemId: group.itemId }))
  );
  const breakdown = {
    polygonOnly: allDiscrepancies.filter(d => d.discrepancyType === 'polygon_only').length,
    baseOnly: allDiscrepancies.filter(d => d.discrepancyType === 'base_only').length,
    balanceMismatch: allDiscrepancies.filter(d => d.discrepancyType === 'balance_mismatch').length,
  };

  // Calculate missing items between chains
  const polygonItemIds = new Set(polygonBalancesByItem.keys());
  const baseItemIds = new Set(baseBalancesByItem.keys());

  const missingFromBase = [...polygonItemIds]
    .filter(itemId => !baseItemIds.has(itemId))
    .sort((a, b) => parseInt(a as string) - parseInt(b as string));
  const missingFromPolygon = [...baseItemIds]
    .filter(itemId => !polygonItemIds.has(itemId))
    .sort((a, b) => parseInt(a as string) - parseInt(b as string));

  // Calculate chain-specific data
  const allPolygonOwners = new Set<string>();
  const allBaseOwners = new Set<string>();

  // Collect all unique owners from each chain
  for (const analysis of polygonAnalyses) {
    for (const owner of analysis.owners) {
      allPolygonOwners.add(owner.address.toLowerCase());
    }
  }

  for (const analysis of baseAnalyses) {
    for (const owner of analysis.owners) {
      allBaseOwners.add(owner.address.toLowerCase());
    }
  }

  // Calculate unique owners (exist on only one chain)
  const polygonUniqueOwners = new Set(
    [...allPolygonOwners].filter(addr => !allBaseOwners.has(addr))
  );
  const baseUniqueOwners = new Set([...allBaseOwners].filter(addr => !allPolygonOwners.has(addr)));

  const chainSpecificData = {
    polygon: {
      totalItems: polygonAnalyses.length,
      totalOwners: allPolygonOwners.size,
      uniqueOwners: polygonUniqueOwners.size,
      uniqueOwnerAddresses: [...polygonUniqueOwners].sort(),
    },
    base: {
      totalItems: baseAnalyses.length,
      totalOwners: allBaseOwners.size,
      uniqueOwners: baseUniqueOwners.size,
      uniqueOwnerAddresses: [...baseUniqueOwners].sort(),
    },
  };

  return {
    timestamp,
    totalItemsCompared: allItemIds.size,
    totalDiscrepancies: allDiscrepancies.length,
    discrepancyBreakdown: breakdown,
    chainSpecificData,
    missingItems: {
      missingFromBase,
      missingFromPolygon,
    },
    itemBalanceComparisons,
    discrepanciesByItem,
    aavegotchiDiamondComparisons,
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

async function analyzeMigrationComparison(): Promise<void> {
  console.log(chalk.cyan.bold('🚀 Starting Cross-Chain Wearables Comparison\n'));
  console.log(chalk.blue('📝 Fetching owners from both Polygon and Base subgraphs.'));
  console.log(chalk.blue('📊 This will compare wearable balances and ownership across chains.\n'));

  try {
    validateEnvironment();
    const chains = getChainConfigs();
    const polygonConfig = chains.find(c => c.name === 'Polygon')!;
    const baseConfig = chains.find(c => c.name === 'Base')!;

    // Get all items with owners from both chains
    console.log(chalk.magenta.bold(`\n🔗 Finding items with owners on both chains\n`));
    const polygonItemIds = await findItemsWithOwners(polygonConfig);
    const baseItemIds = await findItemsWithOwners(baseConfig);

    // Combine and deduplicate item IDs from both chains
    const allItemIds = Array.from(new Set([...polygonItemIds, ...baseItemIds])).sort(
      (a, b) => parseInt(a) - parseInt(b)
    );

    console.log(chalk.green(`✓ Combined total items found: ${allItemIds.length}`));
    console.log(`  - Polygon items: ${polygonItemIds.length}`);
    console.log(`  - Base items: ${baseItemIds.length}`);

    const migrationAnalyses: { polygon: ItemAnalysis[]; base: ItemAnalysis[] } = {
      polygon: [],
      base: [],
    };

    // For each item, get owners from BOTH subgraphs independently
    for (const itemId of allItemIds) {
      try {
        console.log(chalk.cyan.bold(`\n🔍 Analyzing Cross-Chain Item ID: ${itemId}`));

        // Get owners from both subgraphs independently
        const polygonOwners = await fetchAllOwnersForItem(polygonConfig, itemId);
        const baseOwners = await fetchAllOwnersForItem(baseConfig, itemId);

        console.log(`  - Polygon owners: ${polygonOwners.length}`);
        console.log(`  - Base owners: ${baseOwners.length}`);

        // Analyze each chain with its own subgraph data
        const polygonAnalysis = await analyzeItemWithOwners(polygonConfig, itemId, polygonOwners);
        const baseAnalysis = await analyzeItemWithOwners(baseConfig, itemId, baseOwners);

        migrationAnalyses.polygon.push(polygonAnalysis);
        migrationAnalyses.base.push(baseAnalysis);

        // Add delay between items
        await delay(REQUEST_DELAY);
      } catch (error) {
        console.error(chalk.red(`Failed to analyze cross-chain item ${itemId}:`), error);
      }
    }

    // Print individual chain summaries
    console.log(chalk.yellow.bold(`\n📊 Polygon Summary:`));
    printChainSummary(migrationAnalyses.polygon);
    console.log(chalk.yellow.bold(`\n📊 Base Summary:`));
    printChainSummary(migrationAnalyses.base);

    // Perform cross-chain comparison
    console.log(chalk.cyan.bold('\n🔄 Performing Cross-Chain Comparison...\n'));
    const comparisonResult = await compareChainResults(
      migrationAnalyses.polygon,
      migrationAnalyses.base,
      polygonConfig,
      baseConfig
    );

    // Save comparison results to JSON
    await saveComparisonResults(comparisonResult);

    // Print comparison summary
    printComparisonSummary(comparisonResult);
  } catch (error) {
    console.error(chalk.red('Fatal error during migration analysis:'), error);
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
    chalk.blue(
      '📊 Effective balances comparison (contract balance + equipped count for Aavegotchi Diamond, contract only for others)'
    )
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
  if (comparisonResult.chainSpecificData.polygon.uniqueOwnerAddresses.length > 0) {
    console.log(`    Unique addresses (Polygon only):`);
    comparisonResult.chainSpecificData.polygon.uniqueOwnerAddresses.forEach(address => {
      console.log(`      ${chalk.yellow(address)}`);
    });
  }
  console.log(`  Base:`);
  console.log(`    Total items: ${comparisonResult.chainSpecificData.base.totalItems}`);
  console.log(`    Total owners: ${comparisonResult.chainSpecificData.base.totalOwners}`);
  console.log(
    `    Unique owners (Base only): ${chalk.blue(comparisonResult.chainSpecificData.base.uniqueOwners)}`
  );
  if (comparisonResult.chainSpecificData.base.uniqueOwnerAddresses.length > 0) {
    console.log(`    Unique addresses (Base only):`);
    comparisonResult.chainSpecificData.base.uniqueOwnerAddresses.forEach(address => {
      console.log(`      ${chalk.blue(address)}`);
    });
  }

  console.log('\nDiscrepancy Breakdown:');
  console.log(`  Polygon only: ${chalk.yellow(comparisonResult.discrepancyBreakdown.polygonOnly)}`);
  console.log(`  Base only: ${chalk.blue(comparisonResult.discrepancyBreakdown.baseOnly)}`);
  console.log(
    `  Balance mismatches: ${chalk.red(comparisonResult.discrepancyBreakdown.balanceMismatch)}`
  );

  console.log('\nMissing Items:');
  console.log(
    `  Items missing from Base: ${chalk.yellow(comparisonResult.missingItems.missingFromBase.length)}`
  );
  console.log(
    `  Items missing from Polygon: ${chalk.blue(comparisonResult.missingItems.missingFromPolygon.length)}`
  );

  if (comparisonResult.missingItems.missingFromBase.length > 0) {
    console.log('\n  Items missing from Base (first 20):');
    const itemsToShow = comparisonResult.missingItems.missingFromBase.slice(0, 20);
    for (let i = 0; i < itemsToShow.length; i += 10) {
      const batch = itemsToShow.slice(i, i + 10);
      console.log(`    ${batch.join(', ')}`);
    }
    if (comparisonResult.missingItems.missingFromBase.length > 20) {
      console.log(`    ... and ${comparisonResult.missingItems.missingFromBase.length - 20} more`);
    }
  }

  if (comparisonResult.missingItems.missingFromPolygon.length > 0) {
    console.log('\n  Items missing from Polygon (first 20):');
    const itemsToShow = comparisonResult.missingItems.missingFromPolygon.slice(0, 20);
    for (let i = 0; i < itemsToShow.length; i += 10) {
      const batch = itemsToShow.slice(i, i + 10);
      console.log(`    ${batch.join(', ')}`);
    }
    if (comparisonResult.missingItems.missingFromPolygon.length > 20) {
      console.log(
        `    ... and ${comparisonResult.missingItems.missingFromPolygon.length - 20} more`
      );
    }
  }

  // Show total balance comparisons for items with discrepancies
  console.log('\n📊 Total Balance Comparisons (Items with Discrepancies Only):');
  const balanceComparisons = Object.values(comparisonResult.itemBalanceComparisons);
  const totalItemsCompared = comparisonResult.totalItemsCompared;
  const itemsWithDiscrepancies = balanceComparisons.length;

  console.log(`  Total items compared: ${totalItemsCompared}`);
  console.log(
    `  Items with matching total balances: ${chalk.green(totalItemsCompared - itemsWithDiscrepancies)}`
  );
  console.log(`  Items with mismatched total balances: ${chalk.red(itemsWithDiscrepancies)}`);

  // Show top 10 items with largest balance differences
  if (itemsWithDiscrepancies > 0) {
    const itemsWithDifferences = balanceComparisons
      .map(item => ({
        ...item,
        balanceDifference: Math.abs(
          parseInt(item.polygonTotalBalance) - parseInt(item.baseTotalBalance)
        ),
      }))
      .sort((a, b) => b.balanceDifference - a.balanceDifference)
      .slice(0, 10);

    console.log('\n  Top 10 Items with Largest Balance Differences:');
    for (const item of itemsWithDifferences) {
      console.log(`    Item ${item.itemId}:`);
      console.log(
        `      Polygon: ${item.polygonTotalOwners} owners, total balance: ${item.polygonTotalBalance}`
      );
      console.log(
        `      Base: ${item.baseTotalOwners} owners, total balance: ${item.baseTotalBalance}`
      );
      console.log(`      Difference: ${chalk.red(item.balanceDifference)}`);
    }
  } else {
    console.log('\n  🎉 All items have matching total balances across chains!');
  }

  if (comparisonResult.totalDiscrepancies > 0) {
    console.log('\nTop 10 Items with Most Discrepancies:');

    const itemDiscrepancyCounts = Object.entries(comparisonResult.discrepanciesByItem)
      .map(([itemId, group]) => ({
        itemId,
        discrepancyCount: group.discrepancies.length,
        polygonOwners: group.polygonTotalOwners,
        baseOwners: group.baseTotalOwners,
        polygonTotalBalance: group.polygonTotalBalance,
        baseTotalBalance: group.baseTotalBalance,
      }))
      .sort((a, b) => b.discrepancyCount - a.discrepancyCount)
      .slice(0, 10);

    for (const item of itemDiscrepancyCounts) {
      console.log(`  Item ${item.itemId}: ${item.discrepancyCount} discrepancies`);
      console.log(
        `    Polygon: ${item.polygonOwners} owners, total balance: ${item.polygonTotalBalance}`
      );
      console.log(`    Base: ${item.baseOwners} owners, total balance: ${item.baseTotalBalance}`);
    }
  }

  if (comparisonResult.totalDiscrepancies > 0) {
    console.log('\nDetailed Discrepancies by Item (first 5 items):');
    const sortedItems = Object.entries(comparisonResult.discrepanciesByItem)
      .sort(([, a], [, b]) => b.discrepancies.length - a.discrepancies.length)
      .slice(0, 5);

    for (const [itemId, group] of sortedItems) {
      console.log(chalk.cyan(`\n  Item ${itemId} (${group.discrepancies.length} discrepancies):`));
      console.log(
        `    Polygon: ${group.polygonTotalOwners} owners, total balance: ${group.polygonTotalBalance}`
      );
      console.log(
        `    Base: ${group.baseTotalOwners} owners, total balance: ${group.baseTotalBalance}`
      );

      // Show first 3 discrepancies for this item
      const discrepanciesToShow = group.discrepancies.slice(0, 3);
      for (const discrepancy of discrepanciesToShow) {
        const typeColor =
          discrepancy.discrepancyType === 'polygon_only'
            ? chalk.yellow
            : discrepancy.discrepancyType === 'base_only'
              ? chalk.blue
              : chalk.red;
        console.log(
          `    ${discrepancy.address}: ${typeColor(discrepancy.discrepancyType)} (Polygon: ${discrepancy.polygonBalance}, Base: ${discrepancy.baseBalance})`
        );
      }

      if (group.discrepancies.length > 3) {
        console.log(`    ... and ${group.discrepancies.length - 3} more discrepancies`);
      }
    }
  }

  const accuracy =
    comparisonResult.totalItemsCompared > 0
      ? (1 - comparisonResult.totalDiscrepancies / comparisonResult.totalItemsCompared) * 100
      : 100;
  console.log(`\nCross-chain consistency: ${accuracy.toFixed(2)}%`);

  // Print Aavegotchi Diamond specific comparisons
  printAavegotchiDiamondSummary(comparisonResult.aavegotchiDiamondComparisons);
}

function printAavegotchiDiamondSummary(diamondComparisons: {
  [itemId: string]: AavegotchiDiamondComparison;
}): void {
  const comparisons = Object.values(diamondComparisons);

  if (comparisons.length === 0) {
    console.log('\n🔷 Aavegotchi Diamond Analysis: No items with diamond ownership found');
    return;
  }

  console.log(chalk.cyan.bold('\n🔷 AAVEGOTCHI DIAMOND ANALYSIS'));
  console.log('='.repeat(60));

  const contractBalanceMatches = comparisons.filter(c => c.contractBalancesMatch).length;
  const equippedCountMatches = comparisons.filter(c => c.equippedCountsMatch).length;
  const totalMissingFromBase = comparisons.reduce(
    (sum, c) => sum + c.missingAavegotchiIds.missingFromBase.length,
    0
  );
  const totalMissingFromPolygon = comparisons.reduce(
    (sum, c) => sum + c.missingAavegotchiIds.missingFromPolygon.length,
    0
  );

  console.log(`Items with Aavegotchi Diamond ownership: ${comparisons.length}`);
  console.log(
    `Contract balance matches: ${chalk.green(contractBalanceMatches)}/${comparisons.length}`
  );
  console.log(`Equipped count matches: ${chalk.green(equippedCountMatches)}/${comparisons.length}`);
  console.log(`Total Aavegotchi IDs missing from Base: ${chalk.red(totalMissingFromBase)}`);
  console.log(`Total Aavegotchi IDs missing from Polygon: ${chalk.blue(totalMissingFromPolygon)}`);

  // Show contract balance mismatches
  const contractMismatches = comparisons.filter(c => !c.contractBalancesMatch);
  if (contractMismatches.length > 0) {
    console.log(chalk.red(`\nContract Balance Mismatches (${contractMismatches.length}):`));
    contractMismatches.slice(0, 10).forEach(c => {
      console.log(
        `  Item ${c.itemId}: Polygon ${c.polygonContractBalance} ≠ Base ${c.baseContractBalance}`
      );
    });
    if (contractMismatches.length > 10) {
      console.log(`  ... and ${contractMismatches.length - 10} more`);
    }
  }

  // Show equipped count mismatches
  const equippedMismatches = comparisons.filter(c => !c.equippedCountsMatch);
  if (equippedMismatches.length > 0) {
    console.log(chalk.red(`\nEquipped Count Mismatches (${equippedMismatches.length}):`));
    equippedMismatches.slice(0, 10).forEach(c => {
      console.log(
        `  Item ${c.itemId}: Polygon ${c.polygonEquippedCount} ≠ Base ${c.baseEquippedCount}`
      );
    });
    if (equippedMismatches.length > 10) {
      console.log(`  ... and ${equippedMismatches.length - 10} more`);
    }
  }

  // Show missing Aavegotchi IDs summary
  const itemsWithMissingIds = comparisons.filter(
    c =>
      c.missingAavegotchiIds.missingFromBase.length > 0 ||
      c.missingAavegotchiIds.missingFromPolygon.length > 0
  );

  if (itemsWithMissingIds.length > 0) {
    console.log(chalk.red(`\nItems with Missing Aavegotchi IDs (${itemsWithMissingIds.length}):`));
    itemsWithMissingIds.slice(0, 10).forEach(c => {
      const missingFromBase = c.missingAavegotchiIds.missingFromBase;
      const missingFromPolygon = c.missingAavegotchiIds.missingFromPolygon;

      console.log(`  Item ${c.itemId}:`);
      if (missingFromBase.length > 0) {
        console.log(
          `    Missing from Base (${missingFromBase.length}): ${missingFromBase.slice(0, 10).join(', ')}${missingFromBase.length > 10 ? '...' : ''}`
        );
      }
      if (missingFromPolygon.length > 0) {
        console.log(
          `    Missing from Polygon (${missingFromPolygon.length}): ${missingFromPolygon.slice(0, 10).join(', ')}${missingFromPolygon.length > 10 ? '...' : ''}`
        );
      }
    });
    if (itemsWithMissingIds.length > 10) {
      console.log(`  ... and ${itemsWithMissingIds.length - 10} more items with missing IDs`);
    }
  }

  // Show examples of perfect matches
  const perfectMatches = comparisons.filter(c => c.contractBalancesMatch && c.equippedCountsMatch);
  if (perfectMatches.length > 0) {
    console.log(chalk.green(`\nPerfect Matches (${perfectMatches.length}) - Examples:`));
    perfectMatches.slice(0, 5).forEach(c => {
      console.log(
        `  Item ${c.itemId}: Contract ${c.polygonContractBalance}, Equipped ${c.polygonEquippedCount}`
      );
    });
  }
}

// Main execution
async function main() {
  try {
    await analyzeMigrationComparison();
  } catch (error) {
    console.error(chalk.red('Error in main execution:'), error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
