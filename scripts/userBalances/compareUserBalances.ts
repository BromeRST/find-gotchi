import { GraphQLClient } from 'graphql-request';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

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

// Configuration - these will need to be provided
const config = {
  subgraph1Url: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-matic/api`,
  subgraph2Url: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-baseSepolia/version/baseSepolia-testing-contract-28/api`,
  blockNumber1: 72018494,
  blockNumber2: 27090390,
  batchSize: 1000,
};

const GOTCHIS_QUERY = `
      gotchisOriginalOwned(first: 2000) {
        id
      }
`;

const ADD_GOTCHIS_QUERY = false;

const USERS_QUERY = `
  query GetUsers($first: Int!, $skip: Int!, $block: Block_height) {
    users(first: $first, skip: $skip, block: $block) {
      id
      ${ADD_GOTCHIS_QUERY ? GOTCHIS_QUERY : ''}
      portalsOwned(first: 2000, where: { claimedAt: null }) {
        id
      }
      parcelsOwned(first: 2000) {
        id
        parcelHash
      }
      fakeGotchiCardBalances(first: 2000) {
        id
        value
      }
      fakeGotchiNFTTokens(first: 2000) {
        identifier
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
      },
      usersOnlyInSubgraph1,
      usersOnlyInSubgraph2,
      differences,
    };

    // Save results to file
    const outputPath = path.join(process.cwd(), 'data/results', 'user-balance-comparison.json');
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
