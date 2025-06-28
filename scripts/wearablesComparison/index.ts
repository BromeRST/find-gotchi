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
const sepoliaSgEndpoint = `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-baseSepolia/version/baseSepolia-test-mints-6/api`;

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
  subgraphBalance?: string; // For Aavegotchi Diamond addresses, we need both balances
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

interface ItemDiscrepancyGroup {
  itemId: string;
  polygonTotalOwners: number;
  baseSepoliaTotalOwners: number;
  polygonTotalBalance: string;
  baseSepoliaTotalBalance: string;
  discrepancies: Omit<CrossChainDiscrepancy, 'itemId'>[];
}

interface ChainSpecificData {
  totalItems: number;
  totalOwners: number;
  uniqueOwners: number; // Owners that exist only on this chain
}

interface ItemBalanceComparison {
  itemId: string;
  polygonTotalOwners: number;
  baseSepoliaTotalOwners: number;
  polygonTotalBalance: string;
  baseSepoliaTotalBalance: string;
  balancesMatch: boolean;
}

interface AavegotchiDiamondComparison {
  itemId: string;
  polygonContractBalance: string;
  baseSepoliaContractBalance: string;
  contractBalancesMatch: boolean;
  polygonSubgraphBalance: string;
  baseSepoliaSubgraphBalance: string;
  subgraphBalancesMatch: boolean;
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
  missingItems: {
    missingFromBaseSepolia: string[]; // Items that exist on Polygon but not on Base Sepolia
    missingFromPolygon: string[]; // Items that exist on Base Sepolia but not on Polygon
  };
  itemBalanceComparisons: { [itemId: string]: ItemBalanceComparison };
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
const EXCLUDED_ADDRESSES = new Set([
  // Zero address
  '0x0000000000000000000000000000000000000000',

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

  // Base Sepolia contract addresses
  baseSepoliaAddresses.realmDiamond.toLowerCase(),
  baseSepoliaAddresses.installationsDiamond.toLowerCase(),
  baseSepoliaAddresses.tilesDiamond.toLowerCase(),
  // baseSepoliaAddresses.aavegotchiDiamond.toLowerCase(),
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
      subgraphEndpoint: sepoliaSgEndpoint, // Not used - we'll use Polygon owners for both chains
      rpcUrl: process.env.BASE_SEPOLIA_RPC_URL!,
      contractAddress: baseSepoliaAddresses.wearableDiamond,
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
    lowerAddress === baseSepoliaAddresses.aavegotchiDiamond.toLowerCase()
  );
}

function getEffectiveBalance(owner: OwnerBalance): string {
  // For Aavegotchi Diamond addresses, use only subgraph balance
  // For other addresses, use only contract balance
  if (isAavegotchiDiamond(owner.address) && owner.subgraphBalance) {
    return owner.subgraphBalance;
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

        // For Aavegotchi Diamond addresses, we only need subgraph balance
        // For other addresses, we only consider contract balance
        const isDiamond = isAavegotchiDiamond(ownerAddress);
        const shouldInclude = isDiamond
          ? parseInt(subgraphBalance) > 0
          : parseInt(contractBalance) > 0;

        // Only store addresses that should be included and are not excluded
        if (shouldInclude && !isAddressExcluded(ownerAddress)) {
          const ownerBalance: OwnerBalance = {
            address: ownerAddress, // Store the original address from this chain
            contractBalance,
          };

          // Add subgraph balance for Aavegotchi Diamond addresses
          if (isAavegotchiDiamond(ownerAddress)) {
            ownerBalance.subgraphBalance = subgraphBalance;
            // Log when we're handling an Aavegotchi Diamond address with subgraph balance
            if (parseInt(subgraphBalance) > 0) {
              console.log(
                `    🔷 Aavegotchi Diamond detected: ${ownerAddress} - Using subgraph balance: ${subgraphBalance} (ignoring contract balance: ${contractBalance})`
              );
            }
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
  if (fromChain === 'Polygon' && toChain === 'Base Sepolia') {
    if (lowerAddress === polygonAddresses.aavegotchiDiamond.toLowerCase()) {
      return baseSepoliaAddresses.aavegotchiDiamond.toLowerCase();
    }
  } else if (fromChain === 'Base Sepolia' && toChain === 'Polygon') {
    if (lowerAddress === baseSepoliaAddresses.aavegotchiDiamond.toLowerCase()) {
      return polygonAddresses.aavegotchiDiamond.toLowerCase();
    }
  }

  // Return original address if no mapping needed
  return lowerAddress;
}

function compareChainResults(
  polygonAnalyses: ItemAnalysis[],
  baseSepoliaAnalyses: ItemAnalysis[]
): ComparisonResult {
  const discrepanciesByItem: { [itemId: string]: ItemDiscrepancyGroup } = {};
  const itemBalanceComparisons: { [itemId: string]: ItemBalanceComparison } = {};
  const aavegotchiDiamondComparisons: { [itemId: string]: AavegotchiDiamondComparison } = {};
  const timestamp = new Date().toISOString();

  // Create maps for easier lookup - using EFFECTIVE BALANCES (subgraph only for Aavegotchi Diamond, contract only for others)
  const polygonBalancesByItem = new Map<string, Map<string, string>>();
  const baseSepoliaBalancesByItem = new Map<string, Map<string, string>>();
  const polygonAnalysisByItem = new Map<string, ItemAnalysis>();
  const baseSepoliaAnalysisByItem = new Map<string, ItemAnalysis>();

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

  for (const analysis of baseSepoliaAnalyses) {
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
    baseSepoliaBalancesByItem.set(analysis.itemId, balanceMap);
    baseSepoliaAnalysisByItem.set(analysis.itemId, analysis);
  }

  // Find all unique item IDs across both chains
  const allItemIds = new Set([
    ...polygonBalancesByItem.keys(),
    ...baseSepoliaBalancesByItem.keys(),
  ]);

  for (const itemId of allItemIds) {
    const polygonBalances = polygonBalancesByItem.get(itemId) || new Map();
    const baseSepoliaBalances = baseSepoliaBalancesByItem.get(itemId) || new Map();
    const polygonAnalysis = polygonAnalysisByItem.get(itemId);
    const baseSepoliaAnalysis = baseSepoliaAnalysisByItem.get(itemId);

    const itemDiscrepancies: Omit<CrossChainDiscrepancy, 'itemId'>[] = [];

    // Find all unique addresses for this item across both chains, including mapped addresses
    const allAddresses = new Set([...polygonBalances.keys(), ...baseSepoliaBalances.keys()]);

    // Add mapped diamond addresses to ensure we compare them
    for (const address of polygonBalances.keys()) {
      const mappedAddress = mapAddressForComparison(address, 'Polygon', 'Base Sepolia');
      if (mappedAddress !== address.toLowerCase()) {
        allAddresses.add(mappedAddress);
      }
    }
    for (const address of baseSepoliaBalances.keys()) {
      const mappedAddress = mapAddressForComparison(address, 'Base Sepolia', 'Polygon');
      if (mappedAddress !== address.toLowerCase()) {
        allAddresses.add(mappedAddress);
      }
    }

    for (const address of allAddresses) {
      // Skip excluded addresses
      if (isAddressExcluded(address)) continue;

      // Map addresses for cross-chain comparison (handles diamond addresses)
      const mappedAddressForBaseSepolia = mapAddressForComparison(
        address,
        'Polygon',
        'Base Sepolia'
      );
      const mappedAddressForPolygon = mapAddressForComparison(address, 'Base Sepolia', 'Polygon');

      const polygonBalance =
        polygonBalances.get(address) || polygonBalances.get(mappedAddressForPolygon) || '0';
      const baseSepoliaBalance =
        baseSepoliaBalances.get(address) ||
        baseSepoliaBalances.get(mappedAddressForBaseSepolia) ||
        '0';

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

        itemDiscrepancies.push({
          address,
          polygonBalance,
          baseSepoliaBalance,
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

    const baseSepoliaTotalBalance =
      baseSepoliaAnalysis?.owners.reduce((sum, owner) => {
        const balance = parseInt(getEffectiveBalance(owner)) || 0;
        return sum + balance;
      }, 0) || 0;

    // Add balance comparison for ALL items
    itemBalanceComparisons[itemId] = {
      itemId,
      polygonTotalOwners: polygonAnalysis?.totalContractOwners || 0,
      baseSepoliaTotalOwners: baseSepoliaAnalysis?.totalContractOwners || 0,
      polygonTotalBalance: polygonTotalBalance.toString(),
      baseSepoliaTotalBalance: baseSepoliaTotalBalance.toString(),
      balancesMatch: polygonTotalBalance.toString() === baseSepoliaTotalBalance.toString(),
    };

    // Add Aavegotchi Diamond comparison for items that have diamond owners
    const polygonDiamondOwner = polygonAnalysis?.owners.find(owner =>
      isAavegotchiDiamond(owner.address)
    );
    const baseSepoliaDiamondOwner = baseSepoliaAnalysis?.owners.find(owner =>
      isAavegotchiDiamond(owner.address)
    );

    if (polygonDiamondOwner || baseSepoliaDiamondOwner) {
      const polygonContractBalance = polygonDiamondOwner?.contractBalance || '0';
      const baseSepoliaContractBalance = baseSepoliaDiamondOwner?.contractBalance || '0';
      const polygonSubgraphBalance = polygonDiamondOwner?.subgraphBalance || '0';
      const baseSepoliaSubgraphBalance = baseSepoliaDiamondOwner?.subgraphBalance || '0';

      aavegotchiDiamondComparisons[itemId] = {
        itemId,
        polygonContractBalance,
        baseSepoliaContractBalance,
        contractBalancesMatch: polygonContractBalance === baseSepoliaContractBalance,
        polygonSubgraphBalance,
        baseSepoliaSubgraphBalance,
        subgraphBalancesMatch: polygonSubgraphBalance === baseSepoliaSubgraphBalance,
      };
    }

    // Only add to discrepanciesByItem if there are discrepancies
    if (itemDiscrepancies.length > 0) {
      discrepanciesByItem[itemId] = {
        itemId,
        polygonTotalOwners: polygonAnalysis?.totalContractOwners || 0,
        baseSepoliaTotalOwners: baseSepoliaAnalysis?.totalContractOwners || 0,
        polygonTotalBalance: polygonTotalBalance.toString(),
        baseSepoliaTotalBalance: baseSepoliaTotalBalance.toString(),
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
    baseSepoliaOnly: allDiscrepancies.filter(d => d.discrepancyType === 'base_sepolia_only').length,
    balanceMismatch: allDiscrepancies.filter(d => d.discrepancyType === 'balance_mismatch').length,
  };

  // Calculate missing items between chains
  const polygonItemIds = new Set(polygonBalancesByItem.keys());
  const baseSepoliaItemIds = new Set(baseSepoliaBalancesByItem.keys());

  const missingFromBaseSepolia = [...polygonItemIds]
    .filter(itemId => !baseSepoliaItemIds.has(itemId))
    .sort((a, b) => parseInt(a as string) - parseInt(b as string));
  const missingFromPolygon = [...baseSepoliaItemIds]
    .filter(itemId => !polygonItemIds.has(itemId))
    .sort((a, b) => parseInt(a as string) - parseInt(b as string));

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
    totalDiscrepancies: allDiscrepancies.length,
    discrepancyBreakdown: breakdown,
    chainSpecificData,
    missingItems: {
      missingFromBaseSepolia,
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
  console.log(chalk.blue('📝 Fetching owners from both Polygon and Base Sepolia subgraphs.'));
  console.log(chalk.blue('📊 This will compare wearable balances and ownership across chains.\n'));

  try {
    validateEnvironment();
    const chains = getChainConfigs();
    const polygonConfig = chains.find(c => c.name === 'Polygon')!;
    const baseSepoliaConfig = chains.find(c => c.name === 'Base Sepolia')!;

    // Get all items with owners from both chains
    console.log(chalk.magenta.bold(`\n🔗 Finding items with owners on both chains\n`));
    const polygonItemIds = await findItemsWithOwners(polygonConfig);
    const baseSepoliaItemIds = await findItemsWithOwners(baseSepoliaConfig);

    // Combine and deduplicate item IDs from both chains
    const allItemIds = Array.from(new Set([...polygonItemIds, ...baseSepoliaItemIds])).sort(
      (a, b) => parseInt(a) - parseInt(b)
    );

    console.log(chalk.green(`✓ Combined total items found: ${allItemIds.length}`));
    console.log(`  - Polygon items: ${polygonItemIds.length}`);
    console.log(`  - Base Sepolia items: ${baseSepoliaItemIds.length}`);

    const migrationAnalyses: { polygon: ItemAnalysis[]; baseSepolia: ItemAnalysis[] } = {
      polygon: [],
      baseSepolia: [],
    };

    // For each item, get owners from BOTH subgraphs independently
    for (const itemId of allItemIds) {
      try {
        console.log(chalk.cyan.bold(`\n🔍 Analyzing Cross-Chain Item ID: ${itemId}`));

        // Get owners from both subgraphs independently
        const polygonOwners = await fetchAllOwnersForItem(polygonConfig, itemId);
        const baseSepoliaOwners = await fetchAllOwnersForItem(baseSepoliaConfig, itemId);

        console.log(`  - Polygon owners: ${polygonOwners.length}`);
        console.log(`  - Base Sepolia owners: ${baseSepoliaOwners.length}`);

        // Analyze each chain with its own subgraph data
        const polygonAnalysis = await analyzeItemWithOwners(polygonConfig, itemId, polygonOwners);
        const baseSepoliaAnalysis = await analyzeItemWithOwners(
          baseSepoliaConfig,
          itemId,
          baseSepoliaOwners
        );

        migrationAnalyses.polygon.push(polygonAnalysis);
        migrationAnalyses.baseSepolia.push(baseSepoliaAnalysis);

        // Add delay between items
        await delay(REQUEST_DELAY);
      } catch (error) {
        console.error(chalk.red(`Failed to analyze cross-chain item ${itemId}:`), error);
      }
    }

    // Print individual chain summaries
    console.log(chalk.yellow.bold(`\n📊 Polygon Summary:`));
    printChainSummary(migrationAnalyses.polygon);
    console.log(chalk.yellow.bold(`\n📊 Base Sepolia Summary:`));
    printChainSummary(migrationAnalyses.baseSepolia);

    // Perform cross-chain comparison
    console.log(chalk.cyan.bold('\n🔄 Performing Cross-Chain Comparison...\n'));
    const comparisonResult = compareChainResults(
      migrationAnalyses.polygon,
      migrationAnalyses.baseSepolia
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
      '📊 Effective balances comparison (subgraph only for Aavegotchi Diamond, contract only for others)'
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

  console.log('\nMissing Items:');
  console.log(
    `  Items missing from Base Sepolia: ${chalk.yellow(comparisonResult.missingItems.missingFromBaseSepolia.length)}`
  );
  console.log(
    `  Items missing from Polygon: ${chalk.blue(comparisonResult.missingItems.missingFromPolygon.length)}`
  );

  if (comparisonResult.missingItems.missingFromBaseSepolia.length > 0) {
    console.log('\n  Items missing from Base Sepolia (first 20):');
    const itemsToShow = comparisonResult.missingItems.missingFromBaseSepolia.slice(0, 20);
    for (let i = 0; i < itemsToShow.length; i += 10) {
      const batch = itemsToShow.slice(i, i + 10);
      console.log(`    ${batch.join(', ')}`);
    }
    if (comparisonResult.missingItems.missingFromBaseSepolia.length > 20) {
      console.log(
        `    ... and ${comparisonResult.missingItems.missingFromBaseSepolia.length - 20} more`
      );
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

  // Show total balance comparisons for all items
  console.log('\n📊 Total Balance Comparisons (All Items):');
  const balanceComparisons = Object.values(comparisonResult.itemBalanceComparisons);
  const matchingBalances = balanceComparisons.filter(item => item.balancesMatch).length;
  const totalItems = balanceComparisons.length;

  console.log(`  Total items compared: ${totalItems}`);
  console.log(`  Items with matching total balances: ${chalk.green(matchingBalances)}`);
  console.log(
    `  Items with mismatched total balances: ${chalk.red(totalItems - matchingBalances)}`
  );

  // Show top 10 items with largest balance differences
  const itemsWithDifferences = balanceComparisons
    .filter(item => !item.balancesMatch)
    .map(item => ({
      ...item,
      balanceDifference: Math.abs(
        parseInt(item.polygonTotalBalance) - parseInt(item.baseSepoliaTotalBalance)
      ),
    }))
    .sort((a, b) => b.balanceDifference - a.balanceDifference)
    .slice(0, 10);

  if (itemsWithDifferences.length > 0) {
    console.log('\n  Top 10 Items with Largest Balance Differences:');
    for (const item of itemsWithDifferences) {
      console.log(`    Item ${item.itemId}:`);
      console.log(
        `      Polygon: ${item.polygonTotalOwners} owners, total balance: ${item.polygonTotalBalance}`
      );
      console.log(
        `      Base Sepolia: ${item.baseSepoliaTotalOwners} owners, total balance: ${item.baseSepoliaTotalBalance}`
      );
      console.log(`      Difference: ${chalk.red(item.balanceDifference)}`);
    }
  }

  // Show a few examples of items with matching balances
  const itemsWithMatchingBalances = balanceComparisons
    .filter(item => item.balancesMatch && parseInt(item.polygonTotalBalance) > 0)
    .sort((a, b) => parseInt(b.polygonTotalBalance) - parseInt(a.polygonTotalBalance))
    .slice(0, 5);

  if (itemsWithMatchingBalances.length > 0) {
    console.log('\n  Examples of Items with Matching Balances (top 5 by balance):');
    for (const item of itemsWithMatchingBalances) {
      console.log(
        `    Item ${item.itemId}: ${chalk.green('✓')} Polygon & Base Sepolia both have ${item.polygonTotalBalance} total balance (${item.polygonTotalOwners} owners)`
      );
    }
  }

  if (comparisonResult.totalDiscrepancies > 0) {
    console.log('\nTop 10 Items with Most Discrepancies:');

    const itemDiscrepancyCounts = Object.entries(comparisonResult.discrepanciesByItem)
      .map(([itemId, group]) => ({
        itemId,
        discrepancyCount: group.discrepancies.length,
        polygonOwners: group.polygonTotalOwners,
        baseSepoliaOwners: group.baseSepoliaTotalOwners,
        polygonTotalBalance: group.polygonTotalBalance,
        baseSepoliaTotalBalance: group.baseSepoliaTotalBalance,
      }))
      .sort((a, b) => b.discrepancyCount - a.discrepancyCount)
      .slice(0, 10);

    for (const item of itemDiscrepancyCounts) {
      console.log(`  Item ${item.itemId}: ${item.discrepancyCount} discrepancies`);
      console.log(
        `    Polygon: ${item.polygonOwners} owners, total balance: ${item.polygonTotalBalance}`
      );
      console.log(
        `    Base Sepolia: ${item.baseSepoliaOwners} owners, total balance: ${item.baseSepoliaTotalBalance}`
      );
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
        `    Base Sepolia: ${group.baseSepoliaTotalOwners} owners, total balance: ${group.baseSepoliaTotalBalance}`
      );

      // Show first 3 discrepancies for this item
      const discrepanciesToShow = group.discrepancies.slice(0, 3);
      for (const discrepancy of discrepanciesToShow) {
        const typeColor =
          discrepancy.discrepancyType === 'polygon_only'
            ? chalk.yellow
            : discrepancy.discrepancyType === 'base_sepolia_only'
              ? chalk.blue
              : chalk.red;
        console.log(
          `    ${discrepancy.address}: ${typeColor(discrepancy.discrepancyType)} (Polygon: ${discrepancy.polygonBalance}, Base Sepolia: ${discrepancy.baseSepoliaBalance})`
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
  const subgraphBalanceMatches = comparisons.filter(c => c.subgraphBalancesMatch).length;

  console.log(`Items with Aavegotchi Diamond ownership: ${comparisons.length}`);
  console.log(
    `Contract balance matches: ${chalk.green(contractBalanceMatches)}/${comparisons.length}`
  );
  console.log(
    `Subgraph balance matches: ${chalk.green(subgraphBalanceMatches)}/${comparisons.length}`
  );

  // Show contract balance mismatches
  const contractMismatches = comparisons.filter(c => !c.contractBalancesMatch);
  if (contractMismatches.length > 0) {
    console.log(chalk.red(`\nContract Balance Mismatches (${contractMismatches.length}):`));
    contractMismatches.slice(0, 10).forEach(c => {
      console.log(
        `  Item ${c.itemId}: Polygon ${c.polygonContractBalance} ≠ Base Sepolia ${c.baseSepoliaContractBalance}`
      );
    });
    if (contractMismatches.length > 10) {
      console.log(`  ... and ${contractMismatches.length - 10} more`);
    }
  }

  // Show subgraph balance mismatches
  const subgraphMismatches = comparisons.filter(c => !c.subgraphBalancesMatch);
  if (subgraphMismatches.length > 0) {
    console.log(chalk.red(`\nSubgraph Balance Mismatches (${subgraphMismatches.length}):`));
    subgraphMismatches.slice(0, 10).forEach(c => {
      console.log(
        `  Item ${c.itemId}: Polygon ${c.polygonSubgraphBalance} ≠ Base Sepolia ${c.baseSepoliaSubgraphBalance}`
      );
    });
    if (subgraphMismatches.length > 10) {
      console.log(`  ... and ${subgraphMismatches.length - 10} more`);
    }
  }

  // Show examples of perfect matches
  const perfectMatches = comparisons.filter(
    c => c.contractBalancesMatch && c.subgraphBalancesMatch
  );
  if (perfectMatches.length > 0) {
    console.log(chalk.green(`\nPerfect Matches (${perfectMatches.length}) - Examples:`));
    perfectMatches.slice(0, 5).forEach(c => {
      console.log(
        `  Item ${c.itemId}: Contract ${c.polygonContractBalance}, Subgraph ${c.polygonSubgraphBalance}`
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
