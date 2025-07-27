import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { GraphQLClient } from 'graphql-request';
import {
  polygonAddresses,
  baseAddresses,
} from '../erc1155-cross-chain-comparison/lib/chainAddresses';
import { EXCLUDED_ADDRESSES } from '../wearablesComparison/index';
import { AAVEGOTCHI_ABI } from './abi';
import {
  AavegotchiBridged,
  AavegotchiDiscrepancy,
  AavegotchiInfo,
  BatchResult,
  ComparisonResult,
  FinalSummary,
} from './types';

dotenv.config();

// Configuration
const CONFIG = {
  POLYGON_RPC_URL: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
  BASE_RPC_URL: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  POLYGON_CONTRACT_ADDRESS: polygonAddresses.aavegotchiDiamond,
  BASE_CONTRACT_ADDRESS: baseAddresses.aavegotchiDiamond,
  POLYGON_BLOCK_NUMBER: 74262598, // Fixed block number for consistent historical comparison
  POLYGON_SUBGRAPH_URL: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-matic/api`,
  ETHEREUM_SUBGRAPH_URL: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-ethereum/api`,
};

// Batch processing configuration
const BATCH_SIZE = 50; // Process 50 IDs at a time
const MIN_ID = 1; // Aavegotchi IDs start from 1, not 0
const MAX_ID = 25000;
const REQUEST_DELAY = 500; // 500ms between requests
const BATCH_DELAY = 2000; // 2 seconds between batches
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

// Vault configuration (Polygon only - vault contract doesn't exist on Base)
const VAULT_ADDRESS = '0xdd564df884fd4e217c9ee6f65b4ba6e5641eac63';
const VAULT_ABI = [
  {
    inputs: [
      {
        internalType: 'address',
        name: '_tokenAddress',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: '_tokenId',
        type: 'uint256',
      },
    ],
    name: 'getDepositor',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

function validateEnvironment(): void {
  if (!CONFIG.POLYGON_RPC_URL) {
    throw new Error('POLYGON_RPC_URL environment variable is required');
  }
  if (!CONFIG.BASE_RPC_URL) {
    throw new Error('BASE_RPC_URL environment variable is required');
  }
  if (!process.env.SUBGRAPH_KEY) {
    throw new Error('SUBGRAPH_KEY environment variable is required for Ethereum subgraph access');
  }
}

async function getVaultRealOwners(
  provider: ethers.JsonRpcProvider,
  tokenIds: string[]
): Promise<Record<string, string>> {
  if (tokenIds.length === 0) {
    return {};
  }

  console.log(chalk.blue(`🏦 Resolving real owners for ${tokenIds.length} vault gotchis...`));

  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);
  const owners: Record<string, string> = {};
  const batchSize = 10;
  const delayBetweenCalls = 200;

  for (let i = 0; i < tokenIds.length; i += batchSize) {
    const batch = tokenIds.slice(i, i + batchSize);

    console.log(
      chalk.gray(
        `📦 Processing vault batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          tokenIds.length / batchSize
        )} (${batch.length} tokens)`
      )
    );

    for (const tokenId of batch) {
      try {
        const owner = await retryWithBackoff(
          async () => {
            return await vault.getDepositor(CONFIG.POLYGON_CONTRACT_ADDRESS, tokenId);
          },
          MAX_RETRIES,
          RETRY_BASE_DELAY,
          `Get vault real owner for token ${tokenId}`
        );
        owners[tokenId] = owner.toLowerCase();

        if (tokenId !== batch[batch.length - 1]) {
          await delay(delayBetweenCalls);
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️  Error getting vault owner for token ${tokenId}: ${error}`));
      }
    }

    if (i + batchSize < tokenIds.length) {
      console.log(chalk.gray('⏳ Waiting 2 seconds before next vault batch...'));
      await delay(2000);
    }
  }

  console.log(
    chalk.green(
      `✅ Found ${Object.keys(owners).length} vault real owners out of ${tokenIds.length} tokens`
    )
  );

  return owners;
}

async function updateVaultOwnersInData(
  provider: ethers.JsonRpcProvider,
  gotchisData: (AavegotchiInfo | null)[],
  tokenIds: string[]
): Promise<(AavegotchiInfo | null)[]> {
  // Identify which gotchis are owned by vault
  const vaultAddress = VAULT_ADDRESS.toLowerCase();
  const vaultTokenIds: string[] = [];

  gotchisData.forEach((gotchi, index) => {
    if (gotchi && gotchi.owner.toLowerCase() === vaultAddress) {
      vaultTokenIds.push(tokenIds[index]);
    }
  });

  if (vaultTokenIds.length === 0) {
    console.log(chalk.gray('No vault-owned gotchis found in this batch'));
    return gotchisData;
  }

  console.log(chalk.blue(`Found ${vaultTokenIds.length} vault-owned gotchis in this batch`));

  // Get real owners for vault gotchis
  const vaultRealOwners = await getVaultRealOwners(provider, vaultTokenIds);

  // Update the data with real owners
  const updatedData = gotchisData.map((gotchi, index) => {
    if (gotchi && gotchi.owner.toLowerCase() === vaultAddress) {
      const tokenId = tokenIds[index];
      const realOwner = vaultRealOwners[tokenId];
      if (realOwner) {
        return {
          ...gotchi,
          owner: realOwner,
        };
      }
    }
    return gotchi;
  });

  console.log(
    chalk.green(`✅ Updated ${Object.keys(vaultRealOwners).length} vault gotchis with real owners`)
  );

  return updatedData;
}

// Lending GraphQL query and types
const GOTCHI_LENDINGS_QUERY = `
  query GetGotchiLendings($first: Int!, $skip: Int!, $block: Block_height) {
    gotchiLendings(
      first: $first,
      skip: $skip,
      block: $block,
      where: {
        cancelled: false
        completed: false
      }
    ) {
      id
      gotchiTokenId
      lender
      gotchi {
        owner {
          id
        }
        originalOwner {
          id
        }
      }
    }
  }
`;

interface GotchiLending {
  id: string;
  gotchiTokenId: string;
  lender: string;
  gotchi: {
    owner: { id: string };
    originalOwner: { id: string };
  };
}

interface GotchiLendingsQueryResult {
  gotchiLendings: GotchiLending[];
}

// Ethereum GraphQL query and types
const ETHEREUM_AAVEGOTCHIS_QUERY = `
  query GetEthereumAavegotchis($first: Int!, $skip: Int!) {
    aavegotchis(
      first: $first,
      skip: $skip,
      orderBy: owner__id
    ) {
      id
      owner {
        id
      }
    }
  }
`;

interface EthereumAavegotchi {
  id: string;
  owner: { id: string };
}

interface EthereumAavegotchisQueryResult {
  aavegotchis: EthereumAavegotchi[];
}

async function fetchEthereumAavegotchisFromSubgraph(
  client: GraphQLClient,
  skip: number,
  first: number
): Promise<EthereumAavegotchi[]> {
  const variables: any = { first, skip };
  const result: EthereumAavegotchisQueryResult = await client.request(
    ETHEREUM_AAVEGOTCHIS_QUERY,
    variables
  );
  return result.aavegotchis;
}

async function fetchGotchiLendingsFromSubgraph(
  client: GraphQLClient,
  skip: number,
  first: number,
  blockNumber?: number
): Promise<GotchiLending[]> {
  const variables: any = { first, skip };
  if (blockNumber) {
    variables.block = { number: blockNumber };
  }
  const result: GotchiLendingsQueryResult = await client.request(GOTCHI_LENDINGS_QUERY, variables);
  return result.gotchiLendings;
}

async function fetchAllGotchiLendingsFromSubgraph(
  subgraphUrl: string,
  batchSize: number = 1000,
  blockNumber?: number
): Promise<GotchiLending[]> {
  const client = new GraphQLClient(subgraphUrl);
  const allLendings: GotchiLending[] = [];
  let skip = 0;
  let hasMore = true;

  console.log(chalk.blue(`📋 Fetching gotchi lendings from Polygon subgraph...`));

  while (hasMore) {
    console.log(chalk.gray(`📝 Fetching lendings batch: skip=${skip}, first=${batchSize}`));

    try {
      const lendings = await retryWithBackoff(
        () => fetchGotchiLendingsFromSubgraph(client, skip, batchSize, blockNumber),
        MAX_RETRIES,
        RETRY_BASE_DELAY,
        `Fetch lendings batch (skip=${skip})`
      );

      if (lendings.length === 0) {
        break;
      }

      allLendings.push(...lendings);

      console.log(
        chalk.gray(`Fetched ${lendings.length} lendings. Total so far: ${allLendings.length}`)
      );

      if (lendings.length < batchSize) {
        break;
      }

      skip += batchSize;
      await delay(REQUEST_DELAY); // Add delay between requests
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Error fetching lendings batch: ${error}`));
      break;
    }
  }

  console.log(chalk.green(`✅ Total gotchi lendings fetched: ${allLendings.length}`));
  return allLendings;
}

async function updatePolygonOwnersFromLendings(
  gotchisData: (AavegotchiInfo | null)[],
  tokenIds: string[],
  lendings: GotchiLending[]
): Promise<(AavegotchiInfo | null)[]> {
  if (lendings.length === 0) {
    console.log(chalk.gray('No active lendings found, skipping lending update'));
    return gotchisData;
  }

  console.log(chalk.blue(`📋 Processing ${lendings.length} active lendings to update owners...`));

  // Create a map of tokenId -> lender for ALL active lendings
  const lendingMap = new Map<string, string>();

  lendings.forEach(lending => {
    // For comparison purposes, use lender as owner for ALL active lendings
    // (not just when owner === originalOwner)
    lendingMap.set(lending.gotchiTokenId, lending.lender.toLowerCase());
  });

  console.log(chalk.blue(`Found ${lendingMap.size} gotchis with active lendings`));

  if (lendingMap.size === 0) {
    console.log(chalk.gray('No active lendings found in this batch'));
    return gotchisData;
  }

  // Update gotchi data with lender as owner
  let updatedCount = 0;
  const updatedData = gotchisData.map((gotchi, index) => {
    if (gotchi) {
      const tokenId = tokenIds[index];
      const lender = lendingMap.get(tokenId);

      if (lender && lender !== gotchi.owner.toLowerCase()) {
        updatedCount++;
        console.log(
          chalk.gray(`Updated gotchi ${tokenId}: owner from ${gotchi.owner} to lender ${lender}`)
        );
        return {
          ...gotchi,
          owner: lender,
        };
      }
    }
    return gotchi;
  });

  console.log(chalk.green(`✅ Updated ${updatedCount} gotchis based on active lending data`));
  return updatedData;
}

async function fetchAllEthereumAavegotchisFromSubgraph(
  subgraphUrl: string,
  batchSize: number = 1000
): Promise<Map<string, string>> {
  const client = new GraphQLClient(subgraphUrl);
  const allGotchis = new Map<string, string>();
  let skip = 0;
  let hasMore = true;

  console.log(chalk.blue(`🌐 Fetching aavegotchis from Ethereum subgraph...`));

  while (hasMore) {
    console.log(chalk.gray(`📝 Fetching ethereum gotchis batch: skip=${skip}, first=${batchSize}`));

    try {
      const gotchis = await retryWithBackoff(
        () => fetchEthereumAavegotchisFromSubgraph(client, skip, batchSize),
        MAX_RETRIES,
        RETRY_BASE_DELAY,
        `Fetch Ethereum gotchis batch (skip=${skip})`
      );

      if (gotchis.length === 0) {
        break;
      }

      gotchis.forEach(gotchi => {
        allGotchis.set(gotchi.id, gotchi.owner.id.toLowerCase());
      });

      console.log(
        chalk.gray(`Fetched ${gotchis.length} ethereum gotchis. Total so far: ${allGotchis.size}`)
      );

      if (gotchis.length < batchSize) {
        break;
      }

      skip += batchSize;
      await delay(REQUEST_DELAY); // Add delay between requests
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Error fetching Ethereum batch: ${error}`));
      break;
    }
  }

  console.log(chalk.green(`✅ Total ethereum aavegotchis fetched: ${allGotchis.size}`));
  return allGotchis;
}

async function updatePolygonOwnersFromEthereum(
  gotchisData: (AavegotchiInfo | null)[],
  tokenIds: string[],
  ethereumGotchiOwners: Map<string, string>
): Promise<(AavegotchiInfo | null)[]> {
  if (ethereumGotchiOwners.size === 0) {
    console.log(chalk.gray('No Ethereum gotchi owners found, skipping Ethereum update'));
    return gotchisData;
  }

  console.log(
    chalk.blue(
      `🌐 Updating Polygon owners based on ${ethereumGotchiOwners.size} Ethereum gotchis...`
    )
  );

  let updatedCount = 0;
  const updatedData = gotchisData.map((gotchi, index) => {
    if (gotchi) {
      const tokenId = tokenIds[index];
      const ethereumOwner = ethereumGotchiOwners.get(tokenId);

      if (ethereumOwner && ethereumOwner !== gotchi.owner.toLowerCase()) {
        updatedCount++;
        console.log(
          chalk.gray(
            `Updated gotchi ${tokenId}: owner from ${gotchi.owner} to ethereum owner ${ethereumOwner}`
          )
        );
        return {
          ...gotchi,
          owner: ethereumOwner,
        };
      }
    }
    return gotchi;
  });

  console.log(chalk.green(`✅ Updated ${updatedCount} gotchis based on Ethereum ownership data`));
  return updatedData;
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

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.warn(
        chalk.yellow(
          `${operationName} failed (attempt ${attempt}/${maxRetries}): ${lastError.message}`
        )
      );

      if (attempt === maxRetries) {
        break;
      }

      const delayMs = baseDelay * Math.pow(2, attempt - 1);
      console.log(chalk.gray(`Retrying in ${delayMs}ms...`));
      await delay(delayMs);
    }
  }

  throw new Error(`${operationName} failed after ${maxRetries} attempts: ${lastError!.message}`);
}

async function getAavegotchiData(
  contract: ethers.Contract,
  tokenId: string,
  blockNumber?: number
): Promise<AavegotchiInfo> {
  return await retryWithBackoff(
    async () => {
      const overrides = blockNumber ? { blockTag: blockNumber } : {};
      const result = await contract.getAavegotchi(tokenId, overrides);

      // Normalize address fields to lowercase for consistent comparison
      if (result.owner) {
        result.owner = result.owner.toLowerCase();
      }
      if (result.collateral) {
        result.collateral = result.collateral.toLowerCase();
      }
      if (result.escrow) {
        result.escrow = result.escrow.toLowerCase();
      }

      return result;
    },
    MAX_RETRIES,
    RETRY_BASE_DELAY,
    `Get Aavegotchi data for token ${tokenId}${blockNumber ? ` at block ${blockNumber}` : ''}`
  );
}

async function getBatchAavegotchiData(
  contract: ethers.Contract,
  tokenIds: string[],
  blockNumber?: number
): Promise<AavegotchiBridged[]> {
  return await retryWithBackoff(
    async () => {
      const overrides = blockNumber ? { blockTag: blockNumber } : {};
      const result = await contract.batchGetBridgedAavegotchi(tokenIds, overrides);
      return result;
    },
    MAX_RETRIES,
    RETRY_BASE_DELAY,
    `Get batch Aavegotchi data for ${tokenIds.length} tokens${blockNumber ? ` at block ${blockNumber}` : ''}`
  );
}

function convertBridgedToInfo(bridged: AavegotchiBridged, tokenId: string): AavegotchiInfo {
  // Convert AavegotchiBridged to AavegotchiInfo format for comparison
  // Note: Some fields are not available in the bridged format, so we'll use default values
  return {
    tokenId: BigInt(tokenId),
    name: bridged.name,
    owner: bridged.owner.toLowerCase(), // Normalize address to lowercase
    randomNumber: bridged.randomNumber,
    status: bridged.status,
    numericTraits: bridged.numericTraits,
    modifiedNumericTraits: bridged.numericTraits, // Not available in bridged, use base traits
    equippedWearables: bridged.equippedWearables,
    collateral: bridged.collateralType.toLowerCase(), // Normalize address to lowercase
    escrow: bridged.escrow.toLowerCase(), // Normalize address to lowercase
    stakedAmount: BigInt(0), // Not available in bridged format
    minimumStake: bridged.minimumStake,
    kinship: BigInt(0), // Not available in bridged format
    lastInteracted: bridged.lastInteracted,
    experience: bridged.experience,
    toNextLevel: BigInt(0), // Not available in bridged format
    usedSkillPoints: bridged.usedSkillPoints,
    level: BigInt(0), // Not available in bridged format
    hauntId: bridged.hauntId,
    baseRarityScore: BigInt(0), // Not available in bridged format
    modifiedRarityScore: BigInt(0), // Not available in bridged format
    locked: bridged.locked,
    items: bridged.items.map(item => ({ balance: BigInt(0), itemId: item, itemType: null })), // Simplified items format
  };
}

function compareAavegotchiData(
  tokenId: string,
  polygonData: AavegotchiInfo | null,
  baseData: AavegotchiInfo | null
): ComparisonResult {
  const discrepancies: AavegotchiDiscrepancy[] = [];

  if (!polygonData && !baseData) {
    return {
      timestamp: new Date().toISOString(),
      tokenId,
      polygonData: null,
      baseData: null,
      isIdentical: false,
      discrepancies: [],
      error: 'Data not found on either chain',
    };
  }

  if (!polygonData) {
    return {
      timestamp: new Date().toISOString(),
      tokenId,
      polygonData: null,
      baseData: baseData,
      isIdentical: false,
      discrepancies: [
        {
          field: 'existence',
          polygonValue: null,
          baseValue: 'exists',
          discrepancyType: 'missing_polygon',
        },
      ],
    };
  }

  if (!baseData) {
    return {
      timestamp: new Date().toISOString(),
      tokenId,
      polygonData,
      baseData: null,
      isIdentical: false,
      discrepancies: [
        {
          field: 'existence',
          polygonValue: 'exists',
          baseValue: null,
          discrepancyType: 'missing_base',
        },
      ],
    };
  }

  // Compare all fields
  const fieldsToCompare = [
    'name',
    'owner',
    'randomNumber',
    'status',
    'collateral',
    'minimumStake',
    'experience',
    'toNextLevel',
    'usedSkillPoints',
    'level',
    'hauntId',
    'baseRarityScore',
    'modifiedRarityScore',
  ];

  for (const field of fieldsToCompare) {
    const polygonValue = polygonData[field as keyof AavegotchiInfo];
    const baseValue = baseData[field as keyof AavegotchiInfo];

    if (typeof polygonValue === 'bigint' && typeof baseValue === 'bigint') {
      if (polygonValue !== baseValue) {
        discrepancies.push({
          field,
          polygonValue: polygonValue.toString(),
          baseValue: baseValue.toString(),
          discrepancyType: 'value_mismatch',
        });
      }
    } else {
      // Special handling for address fields (normalize to lowercase)
      const addressFields = ['owner', 'collateral', 'escrow'];
      if (addressFields.includes(field)) {
        const normalizedPolygonValue =
          typeof polygonValue === 'string' ? polygonValue.toLowerCase() : polygonValue;
        const normalizedBaseValue =
          typeof baseValue === 'string' ? baseValue.toLowerCase() : baseValue;

        if (normalizedPolygonValue !== normalizedBaseValue) {
          discrepancies.push({
            field,
            polygonValue,
            baseValue: baseValue,
            discrepancyType: 'value_mismatch',
          });
        }
      } else if (polygonValue !== baseValue) {
        discrepancies.push({
          field,
          polygonValue,
          baseValue: baseValue,
          discrepancyType: 'value_mismatch',
        });
      }
    }
  }

  // Compare arrays
  const arrayFieldsToCompare = ['numericTraits', 'modifiedNumericTraits', 'equippedWearables'];

  for (const field of arrayFieldsToCompare) {
    const polygonArray = polygonData[field as keyof AavegotchiInfo] as bigint[];
    const baseArray = baseData[field as keyof AavegotchiInfo] as bigint[];

    if (polygonArray.length !== baseArray.length) {
      discrepancies.push({
        field: `${field}_length`,
        polygonValue: polygonArray.length,
        baseValue: baseArray.length,
        discrepancyType: 'value_mismatch',
      });
    } else {
      for (let i = 0; i < polygonArray.length; i++) {
        if (polygonArray[i] !== baseArray[i]) {
          discrepancies.push({
            field: `${field}[${i}]`,
            polygonValue: polygonArray[i].toString(),
            baseValue: baseArray[i].toString(),
            discrepancyType: 'value_mismatch',
          });
        }
      }
    }
  }

  // Compare items array (basic comparison - can be expanded)
  const polygonItemsLength = polygonData.items?.length || 0;
  const baseItemsLength = baseData.items?.length || 0;

  if (polygonItemsLength !== baseItemsLength) {
    discrepancies.push({
      field: 'items_length',
      polygonValue: polygonItemsLength,
      baseValue: baseItemsLength,
      discrepancyType: 'value_mismatch',
    });
  }

  // Filter out ownership discrepancies where Polygon owner is an excluded address
  const originalDiscrepancyCount = discrepancies.length;
  const filteredDiscrepancies = discrepancies.filter(discrepancy => {
    if (discrepancy.field === 'owner' && polygonData?.owner) {
      const polygonOwner = polygonData.owner.toLowerCase();
      if (EXCLUDED_ADDRESSES.has(polygonOwner)) {
        console.log(
          chalk.gray(
            `Filtered out owner discrepancy for token ${tokenId}: Polygon owner ${polygonOwner} is an excluded address`
          )
        );
        // Track filtered discrepancies globally
        if (!(global as any).filteredOwnerDiscrepancies) {
          (global as any).filteredOwnerDiscrepancies = 0;
        }
        (global as any).filteredOwnerDiscrepancies++;
        return false; // Exclude this discrepancy
      }
    }
    return true; // Keep this discrepancy
  });

  if (originalDiscrepancyCount > filteredDiscrepancies.length) {
    console.log(
      chalk.blue(
        `Token ${tokenId}: Reduced discrepancies from ${originalDiscrepancyCount} to ${filteredDiscrepancies.length} after filtering excluded addresses`
      )
    );
  }

  return {
    timestamp: new Date().toISOString(),
    tokenId,
    polygonData,
    baseData: baseData,
    isIdentical: filteredDiscrepancies.length === 0,
    discrepancies: filteredDiscrepancies,
  };
}

async function saveResults(result: ComparisonResult): Promise<void> {
  const outputDir = path.join(__dirname, 'results');
  await fs.mkdir(outputDir, { recursive: true });

  const filename = `comparison_${result.tokenId}_${new Date().toISOString().split('T')[0]}.json`;
  const filepath = path.join(outputDir, filename);

  // Helper function to format Aavegotchi data
  const formatAavegotchiData = (data: AavegotchiInfo | null) => {
    if (!data) return null;

    return {
      Name: data.name,
      Owner: data.owner,
      Level: data.level.toString(),
      Kinship: data.kinship.toString(),
      'Base Rarity Score': data.baseRarityScore.toString(),
      'Modified Rarity Score': data.modifiedRarityScore.toString(),
      Experience: data.experience.toString(),
      'To Next Level': data.toNextLevel.toString(),
      'Used Skill Points': data.usedSkillPoints.toString(),
      'Haunt ID': data.hauntId.toString(),
      'Random Number': data.randomNumber.toString(),
      Status: data.status.toString(),
      Collateral: data.collateral,
      'Minimum Stake': data.minimumStake.toString(),
      'Last Interacted': data.lastInteracted.toString(),
      'Numeric Traits': data.numericTraits.map(trait => trait.toString()),
      'Modified Numeric Traits': data.modifiedNumericTraits.map(trait => trait.toString()),
      'Equipped Wearables': data.equippedWearables.map(wearable => wearable.toString()),
      'Items Count': data.items?.length || 0,
    };
  };

  // Create formatted output
  const formattedResult = {
    'Comparison Summary': {
      'Token ID': result.tokenId,
      Timestamp: result.timestamp,
      'Is Identical': result.isIdentical,
      'Discrepancies Count': result.discrepancies.length,
      Error: result.error || null,
    },
    'Polygon Data': formatAavegotchiData(result.polygonData),
    'Base Data': formatAavegotchiData(result.baseData),
    Discrepancies: result.discrepancies.map((discrepancy, index) => ({
      [`${index + 1}. Field`]: discrepancy.field,
      Type: discrepancy.discrepancyType,
      'Polygon Value': discrepancy.polygonValue,
      'Base Value': discrepancy.baseValue,
    })),
  };

  await fs.writeFile(filepath, JSON.stringify(formattedResult, null, 2));
  console.log(chalk.green(`✓ Results saved to: ${filepath}`));
}

function printResults(result: ComparisonResult): void {
  console.log(chalk.blue(`\n🔍 Comparison Results for Token ID: ${result.tokenId}`));
  console.log(chalk.gray(`Timestamp: ${result.timestamp}`));
  console.log(chalk.gray(`=`.repeat(60)));

  if (result.error) {
    console.log(chalk.red(`❌ Error: ${result.error}`));
    return;
  }

  if (result.isIdentical) {
    console.log(chalk.green(`✅ Data is identical across both chains!`));
  } else {
    console.log(chalk.yellow(`⚠️  Found ${result.discrepancies.length} discrepancies:`));

    result.discrepancies.forEach((discrepancy, index) => {
      console.log(chalk.yellow(`\n${index + 1}. Field: ${discrepancy.field}`));
      console.log(chalk.gray(`   Type: ${discrepancy.discrepancyType}`));
      console.log(chalk.red(`   Polygon: ${JSON.stringify(discrepancy.polygonValue)}`));
      console.log(chalk.cyan(`   Base: ${JSON.stringify(discrepancy.baseValue)}`));
    });
  }

  // Print basic info for both chains
  if (result.polygonData) {
    console.log(chalk.blue(`\n📊 Polygon Data:`));
    console.log(chalk.gray(`   Name: ${result.polygonData.name}`));
    console.log(chalk.gray(`   Owner: ${result.polygonData.owner}`));
    console.log(chalk.gray(`   Level: ${result.polygonData.level}`));
    console.log(chalk.gray(`   Kinship: ${result.polygonData.kinship}`));
    console.log(chalk.gray(`   Base Rarity Score: ${result.polygonData.baseRarityScore}`));
  }

  if (result.baseData) {
    console.log(chalk.blue(`\n📊 Base Data:`));
    console.log(chalk.gray(`   Name: ${result.baseData.name}`));
    console.log(chalk.gray(`   Owner: ${result.baseData.owner}`));
    console.log(chalk.gray(`   Level: ${result.baseData.level}`));
    console.log(chalk.gray(`   Kinship: ${result.baseData.kinship}`));
    console.log(chalk.gray(`   Base Rarity Score: ${result.baseData.baseRarityScore}`));
  }
}

async function processBatch(
  polygonContract: ethers.Contract,
  baseContract: ethers.Contract,
  tokenIds: string[],
  batchNumber: number
): Promise<BatchResult> {
  console.log(
    chalk.blue(
      `\n📦 Processing Batch ${batchNumber} (${tokenIds.length} tokens) using batchGetBridgedAavegotchi`
    )
  );

  const results: ComparisonResult[] = [];
  let identical = 0;
  let different = 0;
  let errors = 0;
  let missingPolygon = 0;
  let missingBase = 0;

  try {
    // Fetch all tokens in this batch from both chains using batch calls
    console.log(
      chalk.gray(`📥 Fetching Polygon data (batch call for ${tokenIds.length} tokens)...`)
    );
    let polygonBatchData: AavegotchiBridged[] | null = null;
    try {
      polygonBatchData = await getBatchAavegotchiData(
        polygonContract,
        tokenIds,
        CONFIG.POLYGON_BLOCK_NUMBER
      );
      console.log(chalk.green(`✓ Polygon batch data fetched successfully`));
    } catch (err) {
      console.log(
        chalk.yellow(
          `⚠️  Failed to fetch batch from Polygon: ${err instanceof Error ? err.message : 'Unknown error'}`
        )
      );
    }

    console.log(chalk.gray(`📥 Fetching Base data (batch call for ${tokenIds.length} tokens)...`));
    let baseBatchData: AavegotchiBridged[] | null = null;
    try {
      baseBatchData = await getBatchAavegotchiData(baseContract, tokenIds);
      console.log(chalk.green(`✓ Base batch data fetched successfully`));
    } catch (err) {
      console.log(
        chalk.yellow(
          `⚠️  Failed to fetch batch from Base: ${err instanceof Error ? err.message : 'Unknown error'}`
        )
      );
    }

    // Convert batch data to AavegotchiInfo format
    let polygonDataArray: (AavegotchiInfo | null)[] = [];
    let baseDataArray: (AavegotchiInfo | null)[] = [];

    for (let i = 0; i < tokenIds.length; i++) {
      const tokenId = tokenIds[i];

      if (polygonBatchData && polygonBatchData[i]) {
        polygonDataArray.push(convertBridgedToInfo(polygonBatchData[i], tokenId));
      } else {
        polygonDataArray.push(null);
      }

      if (baseBatchData && baseBatchData[i]) {
        baseDataArray.push(convertBridgedToInfo(baseBatchData[i], tokenId));
      } else {
        baseDataArray.push(null);
      }
    }

    // Apply owner resolution for Polygon only (Polygon-specific processes)
    const polygonProvider = new ethers.JsonRpcProvider(CONFIG.POLYGON_RPC_URL);

    // 1. Update owners based on lending data (only for first batch to avoid multiple fetches)
    if (batchNumber === 1) {
      console.log(chalk.blue(`📋 Fetching gotchi lending data for all tokens...`));
      const polygonLendings = await fetchAllGotchiLendingsFromSubgraph(
        CONFIG.POLYGON_SUBGRAPH_URL,
        1000,
        CONFIG.POLYGON_BLOCK_NUMBER
      );
      // Store globally for subsequent batches
      (global as any).polygonLendings = polygonLendings;
    }

    if ((global as any).polygonLendings) {
      console.log(chalk.blue(`📋 Updating Polygon owners from lending data...`));
      polygonDataArray = await updatePolygonOwnersFromLendings(
        polygonDataArray,
        tokenIds,
        (global as any).polygonLendings
      );
    }

    // 2. Resolve vault owners
    console.log(chalk.blue(`🏦 Resolving vault owners for Polygon data...`));
    polygonDataArray = await updateVaultOwnersInData(polygonProvider, polygonDataArray, tokenIds);

    // 3. Update owners based on Ethereum data (only for first batch to avoid multiple fetches)
    if (batchNumber === 1) {
      console.log(chalk.blue(`🌐 Fetching Ethereum gotchi ownership data for all tokens...`));
      const ethereumGotchiOwners = await fetchAllEthereumAavegotchisFromSubgraph(
        CONFIG.ETHEREUM_SUBGRAPH_URL
      );
      // Store globally for subsequent batches
      (global as any).ethereumGotchiOwners = ethereumGotchiOwners;
    }

    if ((global as any).ethereumGotchiOwners) {
      console.log(chalk.blue(`🌐 Updating Polygon owners from Ethereum data...`));
      polygonDataArray = await updatePolygonOwnersFromEthereum(
        polygonDataArray,
        tokenIds,
        (global as any).ethereumGotchiOwners
      );
    }

    // Process each token in the batch
    for (let i = 0; i < tokenIds.length; i++) {
      const tokenId = tokenIds[i];

      try {
        const polygonData = polygonDataArray[i];
        const baseData = baseDataArray[i];
        let error: string | undefined;

        if (!polygonData && !baseData) {
          error = 'Failed to fetch data from both chains';
        }

        const result = compareAavegotchiData(tokenId, polygonData, baseData);
        if (error) {
          result.error = error;
        }

        results.push(result);

        // Update counters
        if (result.error) {
          errors++;
        } else if (result.isIdentical) {
          identical++;
        } else {
          different++;

          // Check for missing data
          if (!result.polygonData && result.baseData) {
            missingPolygon++;
          } else if (result.polygonData && !result.baseData) {
            missingBase++;
          }
        }

        // Progress update every 10 tokens
        if ((i + 1) % 10 === 0 || i === tokenIds.length - 1) {
          const progress = ((i + 1) / tokenIds.length) * 100;
          console.log(
            chalk.gray(
              `  Progress: ${progress.toFixed(1)}% (${i + 1}/${tokenIds.length}) | Discrepancies: ${different}`
            )
          );
        }
      } catch (error) {
        console.error(chalk.red(`Error processing token ${tokenId}:`, error));
        results.push({
          timestamp: new Date().toISOString(),
          tokenId,
          polygonData: null,
          baseData: null,
          isIdentical: false,
          discrepancies: [],
          error: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
        errors++;
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error processing batch ${batchNumber}:`, error));
    // If batch processing fails, add error for all tokens
    for (const tokenId of tokenIds) {
      results.push({
        timestamp: new Date().toISOString(),
        tokenId,
        polygonData: null,
        baseData: null,
        isIdentical: false,
        discrepancies: [],
        error: `Batch processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      errors++;
    }
  }

  const batchResult: BatchResult = {
    timestamp: new Date().toISOString(),
    batchNumber,
    startId: parseInt(tokenIds[0]),
    endId: parseInt(tokenIds[tokenIds.length - 1]),
    results,
    summary: {
      total: tokenIds.length,
      identical,
      different,
      errors,
      missingPolygon,
      missingBase,
    },
  };

  console.log(
    chalk.green(
      `✓ Batch ${batchNumber} completed: ${identical} identical, ${different} different, ${errors} errors`
    )
  );

  return batchResult;
}

async function saveFinalSummary(summary: FinalSummary): Promise<void> {
  const outputDir = path.join(__dirname, 'results');
  await fs.mkdir(outputDir, { recursive: true });

  const filename = `complete_comparison_${new Date().toISOString().split('T')[0]}.json`;
  const filepath = path.join(outputDir, filename);

  const formattedSummary = {
    'Comparison Summary': {
      Timestamp: summary.timestamp,
      'Total Processed': summary.totalProcessed,
      'Processing Time': summary.processingTime,
      'Polygon Block Number': summary.polygonBlockNumber,
      'Overall Statistics': {
        Identical: summary.overallSummary.identical,
        Different: summary.overallSummary.different,
        Errors: summary.overallSummary.errors,
        'Missing on Polygon': summary.overallSummary.missingPolygon,
        'Missing on Base': summary.overallSummary.missingBase,
        'Filtered Owner Discrepancies (Excluded Addresses)': summary.filteredOwnerDiscrepancies,
      },
      'Field Discrepancies': summary.fieldDiscrepancies,
    },
    'Token Discrepancies': summary.allResults
      .filter(result => !result.isIdentical || result.error) // Only include tokens with discrepancies or errors
      .map(result => ({
        'Token ID': result.tokenId,
        'Is Identical': result.isIdentical,
        Error: result.error || null,
        'Discrepancies Count': result.discrepancies.length,
        Discrepancies: result.discrepancies.map((discrepancy, index) => ({
          [`${index + 1}. Field`]: discrepancy.field,
          Type: discrepancy.discrepancyType,
          'Polygon Value': discrepancy.polygonValue,
          'Base Value': discrepancy.baseValue,
        })),
      })),
  };

  await fs.writeFile(filepath, JSON.stringify(formattedSummary, null, 2));
  console.log(chalk.green(`✓ Discrepancies and summary saved to: ${filepath}`));
  console.log(
    chalk.gray(
      `📊 Total tokens with discrepancies: ${formattedSummary['Token Discrepancies'].length}`
    )
  );
}

async function compareAllOnChainGotchis(): Promise<FinalSummary> {
  console.log(
    chalk.blue(`🚀 Starting batch comparison for all Aavegotchi IDs (${MIN_ID}-${MAX_ID})`)
  );

  const startTime = Date.now();

  // Create providers
  const polygonProvider = new ethers.JsonRpcProvider(CONFIG.POLYGON_RPC_URL);
  const baseProvider = new ethers.JsonRpcProvider(CONFIG.BASE_RPC_URL);

  // Create contracts
  const polygonContract = new ethers.Contract(
    CONFIG.POLYGON_CONTRACT_ADDRESS,
    AAVEGOTCHI_ABI,
    polygonProvider
  );

  const baseContract = new ethers.Contract(
    CONFIG.BASE_CONTRACT_ADDRESS,
    AAVEGOTCHI_ABI,
    baseProvider
  );

  const allResults: ComparisonResult[] = [];
  const batchSummaries: FinalSummary['batchSummaries'] = [];
  let overallSummary = {
    identical: 0,
    different: 0,
    errors: 0,
    missingPolygon: 0,
    missingBase: 0,
  };

  // Generate all token IDs and split into batches (starting from 1, not 0)
  const totalTokens = MAX_ID - MIN_ID + 1; // Total tokens from MIN_ID to MAX_ID inclusive
  const totalBatches = Math.ceil(totalTokens / BATCH_SIZE);

  for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
    const startId = MIN_ID + (batchNum - 1) * BATCH_SIZE;
    const endId = Math.min(startId + BATCH_SIZE - 1, MAX_ID);

    const tokenIds: string[] = [];
    for (let id = startId; id <= endId; id++) {
      tokenIds.push(id.toString());
    }

    try {
      const batchResult = await processBatch(polygonContract, baseContract, tokenIds, batchNum);

      // Add all results to the main array
      allResults.push(...batchResult.results);

      // Add batch summary
      batchSummaries.push({
        batchNumber: batchResult.batchNumber,
        startId: batchResult.startId,
        endId: batchResult.endId,
        summary: batchResult.summary,
      });

      // Update overall summary
      overallSummary.identical += batchResult.summary.identical;
      overallSummary.different += batchResult.summary.different;
      overallSummary.errors += batchResult.summary.errors;
      overallSummary.missingPolygon += batchResult.summary.missingPolygon;
      overallSummary.missingBase += batchResult.summary.missingBase;

      // Progress update
      console.log(
        chalk.cyan(
          `\n📈 Progress: ${batchNum}/${totalBatches} batches completed (${Math.round((batchNum / totalBatches) * 100)}%)`
        )
      );
      console.log(
        chalk.cyan(
          `Overall: ${overallSummary.identical} identical, ${overallSummary.different} different, ${overallSummary.errors} errors\n`
        )
      );

      // Add delay between batches (except for the last one)
      if (batchNum < totalBatches) {
        console.log(chalk.gray(`Waiting ${BATCH_DELAY}ms before next batch...`));
        await delay(BATCH_DELAY);
      }
    } catch (error) {
      console.error(chalk.red(`Error processing batch ${batchNum}:`, error));
      // Continue with next batch
    }
  }

  const endTime = Date.now();
  const processingTime = `${Math.round((endTime - startTime) / 1000)}s`;

  // Calculate field-level discrepancy statistics
  const fieldDiscrepancies: Record<string, number> = {};

  allResults.forEach(result => {
    result.discrepancies.forEach(discrepancy => {
      const field = discrepancy.field;
      fieldDiscrepancies[field] = (fieldDiscrepancies[field] || 0) + 1;
    });
  });

  // Sort fields by discrepancy count (most problematic first)
  const sortedFieldDiscrepancies = Object.entries(fieldDiscrepancies)
    .sort(([, a], [, b]) => b - a)
    .reduce(
      (acc, [field, count]) => {
        acc[field] = count;
        return acc;
      },
      {} as Record<string, number>
    );

  const finalSummary: FinalSummary = {
    timestamp: new Date().toISOString(),
    totalProcessed: totalTokens,
    totalBatches: batchSummaries.length,
    overallSummary,
    processingTime,
    polygonBlockNumber: CONFIG.POLYGON_BLOCK_NUMBER,
    filteredOwnerDiscrepancies: (global as any).filteredOwnerDiscrepancies || 0,
    fieldDiscrepancies: sortedFieldDiscrepancies,
    allResults,
    batchSummaries,
  };

  await saveFinalSummary(finalSummary);

  return finalSummary;
}

async function compareOnChainGotchi(tokenId: string): Promise<ComparisonResult> {
  console.log(chalk.blue(`🚀 Starting on-chain comparison for Token ID: ${tokenId}`));

  // Create providers
  const polygonProvider = new ethers.JsonRpcProvider(CONFIG.POLYGON_RPC_URL);
  const baseProvider = new ethers.JsonRpcProvider(CONFIG.BASE_RPC_URL);

  // Create contracts
  const polygonContract = new ethers.Contract(
    CONFIG.POLYGON_CONTRACT_ADDRESS,
    AAVEGOTCHI_ABI,
    polygonProvider
  );

  const baseContract = new ethers.Contract(
    CONFIG.BASE_CONTRACT_ADDRESS,
    AAVEGOTCHI_ABI,
    baseProvider
  );

  let polygonData: AavegotchiInfo | null = null;
  let baseData: AavegotchiInfo | null = null;
  let error: string | undefined;

  try {
    console.log(
      chalk.gray(`📡 Fetching data from Polygon at block ${CONFIG.POLYGON_BLOCK_NUMBER}...`)
    );
    try {
      polygonData = await getAavegotchiData(polygonContract, tokenId, CONFIG.POLYGON_BLOCK_NUMBER);
      console.log(chalk.green('✓ Polygon data fetched successfully'));
    } catch (err) {
      console.log(
        chalk.yellow(
          `⚠️  Failed to fetch from Polygon: ${err instanceof Error ? err.message : 'Unknown error'}`
        )
      );
    }

    console.log(chalk.gray('📡 Fetching data from Base (current state)...'));
    try {
      baseData = await getAavegotchiData(baseContract, tokenId);
      console.log(chalk.green('✓ Base data fetched successfully'));
    } catch (err) {
      console.log(
        chalk.yellow(
          `⚠️  Failed to fetch from Base: ${err instanceof Error ? err.message : 'Unknown error'}`
        )
      );
    }

    // Apply owner resolution for Polygon only (Polygon-specific processes)
    if (polygonData) {
      // 1. Update owners based on lending data
      console.log(chalk.blue(`📋 Fetching gotchi lending data...`));
      const polygonLendings = await fetchAllGotchiLendingsFromSubgraph(
        CONFIG.POLYGON_SUBGRAPH_URL,
        1000,
        CONFIG.POLYGON_BLOCK_NUMBER
      );

      console.log(chalk.blue(`📋 Updating Polygon owner from lending data...`));
      let polygonDataArray = await updatePolygonOwnersFromLendings(
        [polygonData],
        [tokenId],
        polygonLendings
      );
      polygonData = polygonDataArray[0];

      // 2. Resolve vault owners
      console.log(chalk.blue(`🏦 Checking for vault ownership on Polygon...`));
      polygonDataArray = await updateVaultOwnersInData(polygonProvider, [polygonData], [tokenId]);
      polygonData = polygonDataArray[0];

      // 3. Update owners based on Ethereum data
      console.log(chalk.blue(`🌐 Fetching Ethereum ownership data...`));
      const ethereumGotchiOwners = await fetchAllEthereumAavegotchisFromSubgraph(
        CONFIG.ETHEREUM_SUBGRAPH_URL
      );

      console.log(chalk.blue(`🌐 Updating Polygon owner from Ethereum data...`));
      polygonDataArray = await updatePolygonOwnersFromEthereum(
        [polygonData],
        [tokenId],
        ethereumGotchiOwners
      );
      polygonData = polygonDataArray[0];
    }

    if (!polygonData && !baseData) {
      error = 'Failed to fetch data from both chains';
    }
  } catch (err) {
    error = `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }

  const result = compareAavegotchiData(tokenId, polygonData, baseData);
  if (error) {
    result.error = error;
  }

  return result;
}

async function main(): Promise<void> {
  try {
    validateEnvironment();

    // Get command line arguments
    const args = process.argv.slice(2);
    const tokenId = args[0];
    const isAllMode = args.includes('--all') || tokenId === 'all';

    console.log(chalk.blue('🔧 Configuration:'));
    console.log(chalk.gray(`   Polygon RPC: ${CONFIG.POLYGON_RPC_URL}`));
    console.log(chalk.gray(`   Base RPC: ${CONFIG.BASE_RPC_URL}`));
    console.log(chalk.gray(`   Polygon Contract: ${CONFIG.POLYGON_CONTRACT_ADDRESS}`));
    console.log(chalk.gray(`   Base Contract: ${CONFIG.BASE_CONTRACT_ADDRESS}`));
    console.log(chalk.gray(`   Polygon Block Number: ${CONFIG.POLYGON_BLOCK_NUMBER}`));
    console.log(
      chalk.gray(
        `   Polygon Subgraph: ${CONFIG.POLYGON_SUBGRAPH_URL.replace(process.env.SUBGRAPH_KEY || '', '<SUBGRAPH_KEY>')}`
      )
    );
    console.log(
      chalk.gray(
        `   Ethereum Subgraph: ${CONFIG.ETHEREUM_SUBGRAPH_URL.replace(process.env.SUBGRAPH_KEY || '', '<SUBGRAPH_KEY>')}`
      )
    );
    console.log(chalk.gray(`   Polygon Vault Address: ${VAULT_ADDRESS}`));
    console.log(chalk.cyan(`   📋 Lending Resolution: Enabled (Polygon only)`));
    console.log(chalk.cyan(`   🏦 Vault Owner Resolution: Enabled (Polygon only)`));
    console.log(chalk.cyan(`   🌐 Ethereum Owner Resolution: Enabled (Polygon only)`));
    console.log(
      chalk.cyan(`   🚫 Excluded Address Filtering: Enabled (${EXCLUDED_ADDRESSES.size} addresses)`)
    );

    if (isAllMode) {
      // Process all tokens
      console.log(
        chalk.blue(`\n🔄 Batch processing mode: comparing all tokens ${MIN_ID}-${MAX_ID}`)
      );
      console.log(chalk.gray(`   Batch size: ${BATCH_SIZE}`));
      console.log(chalk.gray(`   Request delay: ${REQUEST_DELAY}ms`));
      console.log(chalk.gray(`   Batch delay: ${BATCH_DELAY}ms`));
      console.log(chalk.gray(`   Max retries: ${MAX_RETRIES}`));
      console.log(
        chalk.cyan(
          `   📋 Lending Resolution: Polygon owners will be updated for actively lent gotchis`
        )
      );
      console.log(
        chalk.gray(`      Lending data fetched once and applied to all batches (Polygon only)`)
      );
      console.log(
        chalk.cyan(
          `   🏦 Vault Resolution: Real owners will be resolved for Polygon vault-stored gotchis`
        )
      );
      console.log(
        chalk.gray(`      Vault gotchis will be grouped and resolved efficiently (Polygon only)`)
      );
      console.log(
        chalk.cyan(`   🌐 Ethereum Resolution: Polygon owners will be updated from Ethereum data`)
      );
      console.log(
        chalk.gray(`      Ethereum ownership data fetched once and applied to all batches`)
      );

      const finalSummary = await compareAllOnChainGotchis();

      // Print final summary
      console.log(chalk.blue('\n🎉 Batch processing completed!'));
      console.log(chalk.green(`✅ Total processed: ${finalSummary.totalProcessed}`));
      console.log(chalk.green(`📦 Total batches: ${finalSummary.totalBatches}`));
      console.log(chalk.green(`⏱️  Processing time: ${finalSummary.processingTime}`));
      console.log(chalk.yellow(`📊 Final Statistics:`));
      console.log(chalk.gray(`   • Identical: ${finalSummary.overallSummary.identical}`));
      console.log(chalk.gray(`   • Different: ${finalSummary.overallSummary.different}`));
      console.log(chalk.gray(`   • Errors: ${finalSummary.overallSummary.errors}`));
      console.log(
        chalk.gray(`   • Missing on Polygon: ${finalSummary.overallSummary.missingPolygon}`)
      );
      console.log(chalk.gray(`   • Missing on Base: ${finalSummary.overallSummary.missingBase}`));
      if (finalSummary.filteredOwnerDiscrepancies > 0) {
        console.log(
          chalk.gray(
            `   • Filtered owner discrepancies (excluded addresses): ${finalSummary.filteredOwnerDiscrepancies}`
          )
        );
      }

      // Display field discrepancies if any exist
      if (Object.keys(finalSummary.fieldDiscrepancies).length > 0) {
        console.log(chalk.yellow(`\n🔍 Top Field Discrepancies:`));
        const topFields = Object.entries(finalSummary.fieldDiscrepancies).slice(0, 10);
        topFields.forEach(([field, count], index) => {
          console.log(chalk.gray(`   ${index + 1}. ${field}: ${count} discrepancies`));
        });

        if (Object.keys(finalSummary.fieldDiscrepancies).length > 10) {
          const remaining = Object.keys(finalSummary.fieldDiscrepancies).length - 10;
          console.log(chalk.gray(`   ... and ${remaining} more fields`));
        }
      }
    } else {
      // Single token mode
      if (!tokenId || isNaN(parseInt(tokenId))) {
        console.log(chalk.red('❌ Please provide a valid token ID as an argument'));
        console.log(chalk.gray('Usage:'));
        console.log(chalk.gray('  Single token: npm run compare-onchain-gotchi <tokenId>'));
        console.log(chalk.gray('  All tokens:   npm run compare-onchain-gotchi all'));
        console.log(chalk.gray('  All tokens:   npm run compare-onchain-gotchi --all'));
        process.exit(1);
      }

      console.log(chalk.blue(`\n🔄 Single token mode: comparing token ${tokenId}`));
      console.log(
        chalk.cyan(`   📋 Lending Resolution: Polygon owner will be updated if actively lent`)
      );
      console.log(
        chalk.cyan(`   🏦 Vault Resolution: Real owner will be resolved if stored in Polygon vault`)
      );
      console.log(
        chalk.cyan(`   🌐 Ethereum Resolution: Polygon owner will be updated from Ethereum data`)
      );
      console.log(
        chalk.cyan(
          `   🚫 Excluded Address Filtering: Owner discrepancies with excluded addresses will be filtered out`
        )
      );

      const result = await compareOnChainGotchi(tokenId);
      printResults(result);
      await saveResults(result);
    }
  } catch (error) {
    console.error(
      chalk.red('❌ Fatal error:'),
      error instanceof Error ? error.message : 'Unknown error'
    );
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  compareOnChainGotchi,
  compareAllOnChainGotchis,
  ComparisonResult,
  BatchResult,
  FinalSummary,
  AavegotchiInfo,
};
