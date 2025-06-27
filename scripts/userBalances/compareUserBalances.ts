import { GraphQLClient } from 'graphql-request';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { ownerContractAddressesOnPolygon } from '../lib';
import { polygonAddresses } from '../erc1155-cross-chain-comparison/lib/chainAddresses';
import { ethers } from 'ethers';
import { vaultAbi } from './vaultAbi';

// Load environment variables from .env file
dotenv.config();

// Convert to Set for faster lookup and make case-insensitive
const excludedAddresses = new Set(ownerContractAddressesOnPolygon.map(addr => addr.toLowerCase()));

// Add the 0 address to exclusions
excludedAddresses.add('0x0000000000000000000000000000000000000000');

// Types for the user data structure based on your query
interface User {
  id: string;
  gotchisOriginalOwned: Array<{ id: string }>;
  portalsOwned: Array<{ id: string }>;
  parcelsOwned: Array<{ id: string; parcelHash: string }>;
  fakeGotchiCardBalances: Array<{ id: string; value: string }>;
  fakeGotchiNFTTokens: Array<{ identifier: string }>;
}

interface UsersQueryResult {
  users: User[];
}

interface GotchiLending {
  id: string;
  gotchiTokenId: string;
  lender: string;
  gotchi: {
    owner: {
      id: string;
    };
    originalOwner: {
      id: string;
    };
  };
}

interface GotchiLendingsQueryResult {
  gotchiLendings: GotchiLending[];
}

interface EthereumAavegotchi {
  id: string;
  owner: {
    id: string;
  };
}

interface EthereumAavegotchisQueryResult {
  aavegotchis: EthereumAavegotchi[];
}

interface UserComparison {
  userId: string;
  differences: {
    gotchisOriginalOwned?: {
      subgraph1Count: number;
      subgraph2Count: number;
      onlyInSubgraph1: string[];
      onlyInSubgraph2: string[];
    };
    portalsOwned?: {
      subgraph1Count: number;
      subgraph2Count: number;
      onlyInSubgraph1: string[];
      onlyInSubgraph2: string[];
    };
    parcelsOwned?: {
      subgraph1Count: number;
      subgraph2Count: number;
      onlyInSubgraph1: Array<{ id: string; parcelHash: string }>;
      onlyInSubgraph2: Array<{ id: string; parcelHash: string }>;
    };
    fakeGotchiCardBalances?: {
      subgraph1Count: number;
      subgraph2Count: number;
      onlyInSubgraph1: Array<{ id: string; value: string }>;
      onlyInSubgraph2: Array<{ id: string; value: string }>;
      valueDifferences: Array<{ id: string; subgraph1Value: string; subgraph2Value: string }>;
    };
    fakeGotchiNFTTokens?: {
      subgraph1Count: number;
      subgraph2Count: number;
      onlyInSubgraph1: string[];
      onlyInSubgraph2: string[];
    };
  };
}

const VAULT_ADDRESS = '0xdd564df884fd4e217c9ee6f65b4ba6e5641eac63';
const ethSubgraphUrl = `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-ethereum/api`;

// Configuration - these will need to be provided
const config = {
  subgraph1Url: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-matic/api`,
  subgraph2Url: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-baseSepolia/version/baseSepolia-test-mints-6/api`,
  blockNumber1: 73121283,
  blockNumber2: 27634438,
  batchSize: 1000,
};

const gotchiQuery = `
  gotchisOriginalOwned(first: 2000) {
    id
  }
`;

const portalQuery = `
  portalsOwned(first: 2000, where: { claimedAt: null }) {
    id
  }
`;

const fakegotchiQuery = `
  fakeGotchiNFTTokens(first: 2000) {
    identifier
  }
`;

const parcelQuery = `
  parcelsOwned(first: 2000) {
    id
  }
`;

const queryToUse = gotchiQuery;

const USERS_QUERY = `
  query GetUsers($first: Int!, $skip: Int!, $block: Block_height) {
    users(first: $first, skip: $skip, block: $block) {
      id
      ${queryToUse}
    }
  }
`;

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

async function fetchUsersFromSubgraph(
  client: GraphQLClient,
  skip: number,
  first: number,
  blockNumber?: number
): Promise<User[]> {
  try {
    const variables: any = {
      first,
      skip,
    };

    if (blockNumber) {
      variables.block = { number: blockNumber };
    }

    const result: UsersQueryResult = await client.request(USERS_QUERY, variables);
    return result.users;
  } catch (error) {
    console.error(`Error fetching users from subgraph (skip: ${skip}):`, error);
    throw error;
  }
}

async function fetchAllUsersFromSubgraph(
  subgraphUrl: string,
  blockNumber?: number
): Promise<Map<string, User>> {
  const client = new GraphQLClient(subgraphUrl);
  const allUsers = new Map<string, User>();
  let skip = 0;
  let hasMore = true;

  console.log(`Fetching users from ${subgraphUrl}...`);

  while (hasMore) {
    console.log(`Fetching batch: skip=${skip}, first=${config.batchSize}`);

    const users = await fetchUsersFromSubgraph(client, skip, config.batchSize, blockNumber);

    if (users.length === 0) {
      hasMore = false;
      break;
    }

    users.forEach(user => {
      allUsers.set(user.id, user);
    });

    console.log(`Fetched ${users.length} users. Total so far: ${allUsers.size}`);

    // If we got fewer users than requested, we've reached the end
    if (users.length < config.batchSize) {
      hasMore = false;
    }

    skip += config.batchSize;
  }

  console.log(`Total users fetched from ${subgraphUrl}: ${allUsers.size}`);
  return allUsers;
}

async function fetchGotchiLendingsFromSubgraph(
  client: GraphQLClient,
  skip: number,
  first: number,
  blockNumber?: number
): Promise<GotchiLending[]> {
  try {
    const variables: any = {
      first,
      skip,
    };

    if (blockNumber) {
      variables.block = { number: blockNumber };
    }

    const result: GotchiLendingsQueryResult = await client.request(
      GOTCHI_LENDINGS_QUERY,
      variables
    );
    return result.gotchiLendings;
  } catch (error) {
    console.error(`Error fetching gotchi lendings from subgraph (skip: ${skip}):`, error);
    throw error;
  }
}

async function fetchAllGotchiLendingsFromSubgraph(
  subgraphUrl: string,
  blockNumber?: number
): Promise<GotchiLending[]> {
  const client = new GraphQLClient(subgraphUrl);
  const allLendings: GotchiLending[] = [];
  let skip = 0;
  let hasMore = true;

  console.log(`Fetching gotchi lendings from ${subgraphUrl}...`);

  while (hasMore) {
    console.log(`Fetching lendings batch: skip=${skip}, first=${config.batchSize}`);

    const lendings = await fetchGotchiLendingsFromSubgraph(
      client,
      skip,
      config.batchSize,
      blockNumber
    );

    if (lendings.length === 0) {
      hasMore = false;
      break;
    }

    allLendings.push(...lendings);

    console.log(`Fetched ${lendings.length} lendings. Total so far: ${allLendings.length}`);

    // If we got fewer lendings than requested, we've reached the end
    if (lendings.length < config.batchSize) {
      hasMore = false;
    }

    skip += config.batchSize;
  }

  console.log(`Total gotchi lendings fetched from ${subgraphUrl}: ${allLendings.length}`);
  return allLendings;
}

async function fetchEthereumAavegotchisFromSubgraph(
  client: GraphQLClient,
  skip: number,
  first: number
): Promise<EthereumAavegotchi[]> {
  try {
    const variables: any = {
      first,
      skip,
    };

    const result: EthereumAavegotchisQueryResult = await client.request(
      ETHEREUM_AAVEGOTCHIS_QUERY,
      variables
    );
    return result.aavegotchis;
  } catch (error) {
    console.error(`Error fetching ethereum aavegotchis from subgraph (skip: ${skip}):`, error);
    throw error;
  }
}

async function fetchAllEthereumAavegotchisFromSubgraph(
  subgraphUrl: string
): Promise<Map<string, string>> {
  const client = new GraphQLClient(subgraphUrl);
  const allGotchis = new Map<string, string>(); // tokenId -> ownerId
  let skip = 0;
  let hasMore = true;

  console.log(`Fetching aavegotchis from Ethereum subgraph: ${subgraphUrl}...`);

  while (hasMore) {
    console.log(`Fetching ethereum gotchis batch: skip=${skip}, first=${config.batchSize}`);

    const gotchis = await fetchEthereumAavegotchisFromSubgraph(client, skip, config.batchSize);

    if (gotchis.length === 0) {
      hasMore = false;
      break;
    }

    gotchis.forEach(gotchi => {
      allGotchis.set(gotchi.id, gotchi.owner.id.toLowerCase());
    });

    console.log(`Fetched ${gotchis.length} ethereum gotchis. Total so far: ${allGotchis.size}`);

    // If we got fewer gotchis than requested, we've reached the end
    if (gotchis.length < config.batchSize) {
      hasMore = false;
    }

    skip += config.batchSize;
  }

  console.log(`Total ethereum aavegotchis fetched: ${allGotchis.size}`);
  return allGotchis;
}

function compareArrays<T>(
  arr1: T[],
  arr2: T[],
  keyExtractor: (item: T) => string
): {
  onlyInFirst: T[];
  onlyInSecond: T[];
  inBoth: T[];
} {
  const set1 = new Map(arr1.map(item => [keyExtractor(item), item]));
  const set2 = new Map(arr2.map(item => [keyExtractor(item), item]));

  const onlyInFirst: T[] = [];
  const onlyInSecond: T[] = [];
  const inBoth: T[] = [];

  set1.forEach((item, key) => {
    if (set2.has(key)) {
      inBoth.push(item);
    } else {
      onlyInFirst.push(item);
    }
  });

  set2.forEach((item, key) => {
    if (!set1.has(key)) {
      onlyInSecond.push(item);
    }
  });

  return { onlyInFirst, onlyInSecond, inBoth };
}

function hasAnyBalances(user: User): boolean {
  return (
    (user.gotchisOriginalOwned?.length || 0) > 0 ||
    (user.portalsOwned?.length || 0) > 0 ||
    (user.parcelsOwned?.length || 0) > 0 ||
    (user.fakeGotchiCardBalances?.length || 0) > 0 ||
    (user.fakeGotchiNFTTokens?.length || 0) > 0
  );
}

function compareUsers(user1: User, user2: User): UserComparison | null {
  const differences: UserComparison['differences'] = {};
  let hasDifferences = false;

  // Ensure all arrays are defined with defaults
  const safeUser1 = {
    ...user1,
    gotchisOriginalOwned: user1.gotchisOriginalOwned || [],
    portalsOwned: user1.portalsOwned || [],
    parcelsOwned: user1.parcelsOwned || [],
    fakeGotchiCardBalances: user1.fakeGotchiCardBalances || [],
    fakeGotchiNFTTokens: user1.fakeGotchiNFTTokens || [],
  };

  const safeUser2 = {
    ...user2,
    gotchisOriginalOwned: user2.gotchisOriginalOwned || [],
    portalsOwned: user2.portalsOwned || [],
    parcelsOwned: user2.parcelsOwned || [],
    fakeGotchiCardBalances: user2.fakeGotchiCardBalances || [],
    fakeGotchiNFTTokens: user2.fakeGotchiNFTTokens || [],
  };

  // Compare gotchisOriginalOwned
  const gotchisComparison = compareArrays(
    safeUser1.gotchisOriginalOwned,
    safeUser2.gotchisOriginalOwned,
    item => item.id
  );

  if (gotchisComparison.onlyInFirst.length > 0 || gotchisComparison.onlyInSecond.length > 0) {
    differences.gotchisOriginalOwned = {
      subgraph1Count: safeUser1.gotchisOriginalOwned.length,
      subgraph2Count: safeUser2.gotchisOriginalOwned.length,
      onlyInSubgraph1: gotchisComparison.onlyInFirst.map(g => g.id),
      onlyInSubgraph2: gotchisComparison.onlyInSecond.map(g => g.id),
    };
    hasDifferences = true;
  }

  // Compare portalsOwned
  const portalsComparison = compareArrays(
    safeUser1.portalsOwned,
    safeUser2.portalsOwned,
    item => item.id
  );

  if (portalsComparison.onlyInFirst.length > 0 || portalsComparison.onlyInSecond.length > 0) {
    differences.portalsOwned = {
      subgraph1Count: safeUser1.portalsOwned.length,
      subgraph2Count: safeUser2.portalsOwned.length,
      onlyInSubgraph1: portalsComparison.onlyInFirst.map(p => p.id),
      onlyInSubgraph2: portalsComparison.onlyInSecond.map(p => p.id),
    };
    hasDifferences = true;
  }

  // Compare parcelsOwned
  const parcelsComparison = compareArrays(
    safeUser1.parcelsOwned,
    safeUser2.parcelsOwned,
    item => item.id
  );

  if (parcelsComparison.onlyInFirst.length > 0 || parcelsComparison.onlyInSecond.length > 0) {
    differences.parcelsOwned = {
      subgraph1Count: safeUser1.parcelsOwned.length,
      subgraph2Count: safeUser2.parcelsOwned.length,
      onlyInSubgraph1: parcelsComparison.onlyInFirst,
      onlyInSubgraph2: parcelsComparison.onlyInSecond,
    };
    hasDifferences = true;
  }

  // Compare fakeGotchiCardBalances
  const cardBalancesComparison = compareArrays(
    safeUser1.fakeGotchiCardBalances,
    safeUser2.fakeGotchiCardBalances,
    item => item.id
  );

  const valueDifferences: Array<{ id: string; subgraph1Value: string; subgraph2Value: string }> =
    [];

  // Check for value differences in cards that exist in both
  cardBalancesComparison.inBoth.forEach(card1 => {
    const card2 = safeUser2.fakeGotchiCardBalances.find(c => c.id === card1.id);
    if (card2 && card1.value !== card2.value) {
      valueDifferences.push({
        id: card1.id,
        subgraph1Value: card1.value,
        subgraph2Value: card2.value,
      });
    }
  });

  if (
    cardBalancesComparison.onlyInFirst.length > 0 ||
    cardBalancesComparison.onlyInSecond.length > 0 ||
    valueDifferences.length > 0
  ) {
    differences.fakeGotchiCardBalances = {
      subgraph1Count: safeUser1.fakeGotchiCardBalances.length,
      subgraph2Count: safeUser2.fakeGotchiCardBalances.length,
      onlyInSubgraph1: cardBalancesComparison.onlyInFirst,
      onlyInSubgraph2: cardBalancesComparison.onlyInSecond,
      valueDifferences,
    };
    hasDifferences = true;
  }

  // Compare fakeGotchiNFTTokens
  const nftTokensComparison = compareArrays(
    safeUser1.fakeGotchiNFTTokens,
    safeUser2.fakeGotchiNFTTokens,
    item => item.identifier
  );

  if (nftTokensComparison.onlyInFirst.length > 0 || nftTokensComparison.onlyInSecond.length > 0) {
    differences.fakeGotchiNFTTokens = {
      subgraph1Count: safeUser1.fakeGotchiNFTTokens.length,
      subgraph2Count: safeUser2.fakeGotchiNFTTokens.length,
      onlyInSubgraph1: nftTokensComparison.onlyInFirst.map(t => t.identifier),
      onlyInSubgraph2: nftTokensComparison.onlyInSecond.map(t => t.identifier),
    };
    hasDifferences = true;
  }

  return hasDifferences ? { userId: safeUser1.id, differences } : null;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithDelay<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit =
        error?.info?.error?.message?.includes('rate limit') ||
        error?.message?.includes('rate limit') ||
        error?.code === 'CALL_EXCEPTION';

      if (attempt === maxRetries || !isRateLimit) {
        throw error;
      }

      const delayMs = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
      console.log(`Rate limit hit, retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})`);
      await delay(delayMs);
    }
  }
  throw new Error('Max retries exceeded');
}

export async function getVaultOwner(tokenIds: string[]) {
  const polygonProvider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
  const vault = new ethers.Contract(VAULT_ADDRESS, vaultAbi, polygonProvider);
  const owners: Record<string, string> = {};
  const batchSize = 10; // Process in smaller batches
  const delayBetweenCalls = 200; // 200ms delay between calls

  console.log(`Processing ${tokenIds.length} tokens in batches of ${batchSize}...`);

  for (let i = 0; i < tokenIds.length; i += batchSize) {
    const batch = tokenIds.slice(i, i + batchSize);
    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tokenIds.length / batchSize)} (${batch.length} tokens)`
    );

    for (const tokenId of batch) {
      try {
        const owner = await retryWithDelay(async () => {
          return await vault.getDepositor(polygonAddresses.aavegotchiDiamond, tokenId);
        });
        owners[tokenId] = owner.toLowerCase();

        // Add delay between calls to avoid rate limiting
        if (tokenId !== batch[batch.length - 1]) {
          // Don't delay after last item in batch
          await delay(delayBetweenCalls);
        }
      } catch (error) {
        console.error(`Error getting vault owner for token ${tokenId} after retries:`, error);
      }
    }

    // Longer delay between batches
    if (i + batchSize < tokenIds.length) {
      console.log('Waiting 2 seconds before next batch...');
      await delay(2000);
    }
  }

  console.log(`Found ${Object.keys(owners).length} vault owners out of ${tokenIds.length} tokens`);
  return owners;
}

function processLendingsAndUpdateOriginalOwners(
  users: Map<string, User>,
  lendings: GotchiLending[]
): void {
  console.log(`Processing ${lendings.length} lendings to update original owners...`);

  let updatedCount = 0;

  for (const lending of lendings) {
    const ownerId = lending.gotchi.owner.id.toLowerCase();
    const originalOwnerId = lending.gotchi.originalOwner.id.toLowerCase();

    // Only update if owner === originalOwner (case-insensitive)
    if (ownerId === originalOwnerId) {
      const gotchiTokenId = lending.gotchiTokenId;
      const lenderId = lending.lender;

      // Find the user who owns this gotchi and update the originalOwner
      users.forEach(user => {
        const gotchiToUpdate = user.gotchisOriginalOwned?.find(g => g.id === gotchiTokenId);
        if (gotchiToUpdate) {
          // We need to update the user data structure to reflect the lender as original owner
          // Since we can't directly modify the gotchi's originalOwner in this structure,
          // we need to move the gotchi from current user to the lender user

          // Remove from current user
          user.gotchisOriginalOwned =
            user.gotchisOriginalOwned?.filter(g => g.id !== gotchiTokenId) || [];

          // Add to lender user (or create lender user if doesn't exist)
          if (!users.has(lenderId)) {
            users.set(lenderId, {
              id: lenderId,
              gotchisOriginalOwned: [],
              portalsOwned: [],
              parcelsOwned: [],
              fakeGotchiCardBalances: [],
              fakeGotchiNFTTokens: [],
            });
          }

          const lenderUser = users.get(lenderId)!;
          if (!lenderUser.gotchisOriginalOwned) {
            lenderUser.gotchisOriginalOwned = [];
          }
          lenderUser.gotchisOriginalOwned.push(gotchiToUpdate);

          updatedCount++;
          console.log(
            `Updated gotchi ${gotchiTokenId}: moved from ${user.id} to lender ${lenderId}`
          );
        }
      });
    }
  }

  console.log(`Updated ${updatedCount} gotchis based on lending information`);
}

async function processVaultOwnersAndUpdateOriginalOwners(users: Map<string, User>): Promise<void> {
  console.log('Processing vault owners for gotchis...');

  // Check if we have access to ethers (this function might need to be called differently in actual usage)
  // For now, we'll create a placeholder that can be updated when ethers is available
  try {
    // Collect all gotchi token IDs where the current user is the vault address
    const vaultGotchis: string[] = [];
    const vaultAddress = VAULT_ADDRESS.toLowerCase();

    // Find all gotchis owned by the vault address
    const vaultUser = users.get(vaultAddress);
    if (vaultUser?.gotchisOriginalOwned) {
      vaultUser.gotchisOriginalOwned.forEach(gotchi => {
        vaultGotchis.push(gotchi.id);
      });
    }

    console.log(`Found ${vaultGotchis.length} gotchis owned by vault address`);

    if (vaultGotchis.length === 0) {
      console.log('No gotchis found in vault, skipping vault owner processing');
      return;
    }

    // Get real owners for gotchis stored in the vault
    console.log(`Resolving real owners for ${vaultGotchis.length} gotchis in vault...`);
    const vaultOwners = await getVaultOwner(vaultGotchis);

    // Remove gotchis from vault user
    if (vaultUser) {
      vaultUser.gotchisOriginalOwned = [];
    }

    // Add gotchis to their real original owners
    Object.entries(vaultOwners).forEach(([tokenId, realOwner]) => {
      const realOwnerLower = realOwner.toLowerCase();

      if (!users.has(realOwnerLower)) {
        users.set(realOwnerLower, {
          id: realOwnerLower,
          gotchisOriginalOwned: [],
          portalsOwned: [],
          parcelsOwned: [],
          fakeGotchiCardBalances: [],
          fakeGotchiNFTTokens: [],
        });
      }

      const realOwnerUser = users.get(realOwnerLower)!;
      if (!realOwnerUser.gotchisOriginalOwned) {
        realOwnerUser.gotchisOriginalOwned = [];
      }
      realOwnerUser.gotchisOriginalOwned.push({ id: tokenId });
    });

    console.log(`Updated ${Object.keys(vaultOwners).length} gotchis from vault to real owners`);
  } catch (error) {
    console.error('Error processing vault owners:', error);
  }
}

function updatePolygonOriginalOwnersFromEthereum(
  polygonUsers: Map<string, User>,
  ethereumGotchiOwners: Map<string, string>
): void {
  console.log(
    `Updating Polygon original owners based on ${ethereumGotchiOwners.size} Ethereum gotchis...`
  );

  let updatedCount = 0;
  const gotchisToMove: Array<{ tokenId: string; fromUser: string; toUser: string }> = [];

  // First, identify all gotchis that need to be moved
  polygonUsers.forEach((user, userId) => {
    if (user.gotchisOriginalOwned) {
      user.gotchisOriginalOwned.forEach(gotchi => {
        const ethereumOwner = ethereumGotchiOwners.get(gotchi.id);
        if (ethereumOwner && ethereumOwner !== userId) {
          gotchisToMove.push({
            tokenId: gotchi.id,
            fromUser: userId,
            toUser: ethereumOwner,
          });
        }
      });
    }
  });

  // Execute the moves
  gotchisToMove.forEach(({ tokenId, fromUser, toUser }) => {
    // Remove from current user
    const currentUser = polygonUsers.get(fromUser);
    if (currentUser?.gotchisOriginalOwned) {
      currentUser.gotchisOriginalOwned = currentUser.gotchisOriginalOwned.filter(
        g => g.id !== tokenId
      );
    }

    // Add to ethereum owner (create user if doesn't exist)
    if (!polygonUsers.has(toUser)) {
      polygonUsers.set(toUser, {
        id: toUser,
        gotchisOriginalOwned: [],
        portalsOwned: [],
        parcelsOwned: [],
        fakeGotchiCardBalances: [],
        fakeGotchiNFTTokens: [],
      });
    }

    const targetUser = polygonUsers.get(toUser)!;
    if (!targetUser.gotchisOriginalOwned) {
      targetUser.gotchisOriginalOwned = [];
    }
    targetUser.gotchisOriginalOwned.push({ id: tokenId });

    updatedCount++;
    console.log(`Updated gotchi ${tokenId}: moved from ${fromUser} to ethereum owner ${toUser}`);
  });

  console.log(`Updated ${updatedCount} gotchis based on Ethereum ownership data`);
}

async function main() {
  console.log('Starting user balance comparison...');
  console.log('Configuration:', {
    subgraph1Url: config.subgraph1Url,
    subgraph2Url: config.subgraph2Url,
    blockNumber1: config.blockNumber1,
    blockNumber2: config.blockNumber2,
    batchSize: config.batchSize,
  });

  if (
    config.subgraph1Url === 'PLEASE_SET_SUBGRAPH1_URL' ||
    config.subgraph2Url === 'PLEASE_SET_SUBGRAPH2_URL'
  ) {
    console.error('Please set SUBGRAPH1_URL and SUBGRAPH2_URL environment variables');
    process.exit(1);
  }

  try {
    // Fetch users from both subgraphs
    const [users1, users2] = await Promise.all([
      fetchAllUsersFromSubgraph(config.subgraph1Url, config.blockNumber1),
      fetchAllUsersFromSubgraph(config.subgraph2Url, config.blockNumber2),
    ]);

    // Calculate total IDs found on each chain based on current query type
    let totalIds1 = 0;
    let totalIds2 = 0;

    users1.forEach(user => {
      if (queryToUse.includes('gotchisOriginalOwned')) {
        totalIds1 += user.gotchisOriginalOwned?.length || 0;
      } else if (queryToUse.includes('portalsOwned')) {
        totalIds1 += user.portalsOwned?.length || 0;
      } else if (queryToUse.includes('parcelsOwned')) {
        totalIds1 += user.parcelsOwned?.length || 0;
      } else if (queryToUse.includes('fakeGotchiCardBalances')) {
        totalIds1 += user.fakeGotchiCardBalances?.length || 0;
      } else if (queryToUse.includes('fakeGotchiNFTTokens')) {
        totalIds1 += user.fakeGotchiNFTTokens?.length || 0;
      }
    });

    users2.forEach(user => {
      if (queryToUse.includes('gotchisOriginalOwned')) {
        totalIds2 += user.gotchisOriginalOwned?.length || 0;
      } else if (queryToUse.includes('portalsOwned')) {
        totalIds2 += user.portalsOwned?.length || 0;
      } else if (queryToUse.includes('parcelsOwned')) {
        totalIds2 += user.parcelsOwned?.length || 0;
      } else if (queryToUse.includes('fakeGotchiCardBalances')) {
        totalIds2 += user.fakeGotchiCardBalances?.length || 0;
      } else if (queryToUse.includes('fakeGotchiNFTTokens')) {
        totalIds2 += user.fakeGotchiNFTTokens?.length || 0;
      }
    });

    console.log(`Total IDs found in subgraph1: ${totalIds1}`);
    console.log(`Total IDs found in subgraph2: ${totalIds2}`);

    // Fetch gotchi lendings only from subgraph1 (Polygon) if querying gotchis
    const isGotchiQuery = queryToUse.includes('gotchisOriginalOwned');
    if (isGotchiQuery) {
      console.log('Detected gotchi query - fetching gotchi lendings...');
      const lendings1 = await fetchAllGotchiLendingsFromSubgraph(
        config.subgraph1Url,
        config.blockNumber1
      );

      // Process lendings and update original owners for subgraph1 only
      processLendingsAndUpdateOriginalOwners(users1, lendings1);

      // Handle vault owners for gotchis on polygon (subgraph1)
      console.log('Processing vault owners for gotchis on polygon...');
      await processVaultOwnersAndUpdateOriginalOwners(users1);

      // Fetch gotchis from Ethereum subgraph to get original owners
      console.log('Fetching gotchis from Ethereum subgraph to update original owners...');
      const ethereumGotchiOwners = await fetchAllEthereumAavegotchisFromSubgraph(ethSubgraphUrl);

      // Update Polygon users' original owners based on Ethereum data
      updatePolygonOriginalOwnersFromEthereum(users1, ethereumGotchiOwners);
    } else {
      console.log('Non-gotchi query detected - skipping gotchi lendings fetch');
    }

    // Remove excluded addresses from both subgraphs
    const excludedCount1 = users1.size;
    excludedAddresses.forEach(excludedAddr => {
      users1.delete(excludedAddr);
    });
    console.log(`Excluded ${excludedCount1 - users1.size} contract addresses from subgraph1`);

    const excludedCount2 = users2.size;
    excludedAddresses.forEach(excludedAddr => {
      users2.delete(excludedAddr);
    });
    console.log(`Excluded ${excludedCount2 - users2.size} contract addresses from subgraph2`);

    // Filter users from subgraph 1 to only include those with balances
    const filteredUsers1 = new Map<string, User>();
    let usersWithoutBalances1 = 0;

    users1.forEach((user, userId) => {
      if (hasAnyBalances(user)) {
        filteredUsers1.set(userId, user);
      } else {
        usersWithoutBalances1++;
      }
    });

    // Filter users from subgraph 2 to only include those with balances
    const filteredUsers2 = new Map<string, User>();
    let usersWithoutBalances2 = 0;

    users2.forEach((user, userId) => {
      if (hasAnyBalances(user)) {
        filteredUsers2.set(userId, user);
      } else {
        usersWithoutBalances2++;
      }
    });

    console.log(`\nComparison Summary:`);
    console.log(`Users in subgraph 1 (total): ${users1.size}`);
    console.log(`Users in subgraph 1 (with balances): ${filteredUsers1.size}`);
    console.log(`Users in subgraph 1 (without balances, excluded): ${usersWithoutBalances1}`);
    console.log(`Users in subgraph 2 (total): ${users2.size}`);
    console.log(`Users in subgraph 2 (with balances): ${filteredUsers2.size}`);
    console.log(`Users in subgraph 2 (without balances, excluded): ${usersWithoutBalances2}`);

    // Find all unique user IDs from both filtered subgraphs
    const allUserIds = new Set([...filteredUsers1.keys(), ...filteredUsers2.keys()]);
    console.log(`Total unique users (after filtering): ${allUserIds.size}`);

    const differences: UserComparison[] = [];
    const usersOnlyInSubgraph1: string[] = [];
    const usersOnlyInSubgraph2: string[] = [];

    for (const userId of allUserIds) {
      const user1 = filteredUsers1.get(userId);
      const user2 = filteredUsers2.get(userId);

      if (!user1) {
        usersOnlyInSubgraph2.push(userId);
        continue;
      }

      if (!user2) {
        usersOnlyInSubgraph1.push(userId);
        continue;
      }

      const comparison = compareUsers(user1, user2);
      if (comparison) {
        differences.push(comparison);
      }
    }

    // Prepare final results
    const results = {
      metadata: {
        timestamp: new Date().toISOString(),
        subgraph1Url: config.subgraph1Url.replace(process.env.SUBGRAPH_KEY || '', '<SUBGRAPH_KEY>'),
        subgraph2Url: config.subgraph2Url.replace(process.env.SUBGRAPH_KEY || '', '<SUBGRAPH_KEY>'),
        blockNumber1: config.blockNumber1,
        blockNumber2: config.blockNumber2,
        totalUsersSubgraph1: users1.size,
        usersWithBalancesSubgraph1: filteredUsers1.size,
        usersWithoutBalancesSubgraph1: usersWithoutBalances1,
        totalUsersSubgraph2: users2.size,
        usersWithBalancesSubgraph2: filteredUsers2.size,
        usersWithoutBalancesSubgraph2: usersWithoutBalances2,
        totalUniqueUsers: allUserIds.size,
        usersWithDifferences: differences.length,
        usersOnlyInSubgraph1Count: usersOnlyInSubgraph1.length,
        usersOnlyInSubgraph2Count: usersOnlyInSubgraph2.length,
        totalIdsSubgraph1: totalIds1,
        totalIdsSubgraph2: totalIds2,
      },
      usersOnlyInSubgraph1,
      usersOnlyInSubgraph2,
      differences,
    };

    // Save results to file with query type and date
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // Determine query type based on the query being used
    let queryType = 'unknown-comparison';
    if (queryToUse.includes('gotchisOriginalOwned')) {
      queryType = 'gotchis-comparison';
    } else if (queryToUse.includes('portalsOwned')) {
      queryType = 'portals-comparison';
    } else if (queryToUse.includes('parcelsOwned')) {
      queryType = 'parcels-comparison';
    } else if (queryToUse.includes('fakeGotchiNFTTokens')) {
      queryType = 'fakegotchi-comparison';
    }

    const filename = `${queryType}-${currentDate}.json`;
    const outputPath = path.join(process.cwd(), 'data/results/users', filename);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));

    console.log(`\nResults saved to: ${outputPath}`);
    console.log(`Found ${differences.length} users with differences`);
    console.log(`Found ${usersOnlyInSubgraph1.length} users only in subgraph 1`);
    console.log(`Found ${usersOnlyInSubgraph2.length} users only in subgraph 2`);

    if (differences.length > 0) {
      console.log('\nSample differences:');
      differences.slice(0, 3).forEach(diff => {
        console.log(`User ${diff.userId}:`);
        Object.entries(diff.differences).forEach(([key, value]) => {
          console.log(`  ${key}: ${JSON.stringify(value, null, 2)}`);
        });
      });
    }
  } catch (error) {
    console.error('Error in main process:', error);
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}

export { main, compareUsers, fetchAllUsersFromSubgraph };
