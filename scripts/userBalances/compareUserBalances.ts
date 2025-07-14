import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { ownerContractAddressesOnPolygon } from '../lib';
import { gotchiQuery, portalQuery, fakegotchiQuery, parcelQuery } from './lib/queries';
import {
  fetchAllUsersFromSubgraph,
  fetchAllGotchiLendingsFromSubgraph,
  fetchAllEthereumAavegotchisFromSubgraph,
} from './lib/fetchers';
import { compareUsers, hasAnyBalances } from './lib/compare';
import type { User } from './lib/types';
import {
  processLendingsAndUpdateOriginalOwners,
  processVaultOwnersAndUpdateOriginalOwners,
  updatePolygonOriginalOwnersFromEthereum,
} from './lib/owners';
import { logInfo, logSuccess, logError } from './lib/logger';

dotenv.config();

const excludedAddresses = new Set(ownerContractAddressesOnPolygon.map(a => a.toLowerCase()));
excludedAddresses.add('0x0000000000000000000000000000000000000000');

const ethSubgraphUrl = `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-ethereum/api`;

const config = {
  subgraph1Url: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-matic/api`,
  subgraph2Url: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-baseSepolia/version/baseSepolia-test-mints-33/api`,
  blockNumber1: 73121283,
  blockNumber2: 27837155,
  batchSize: 1000,
};

// Select which query to run
const queryToUse = gotchiQuery;

async function main() {
  logInfo('Starting user balance comparison...');
  logInfo(`Configuration: ${JSON.stringify(config, null, 2)}`);

  const [users1, users2] = await Promise.all([
    fetchAllUsersFromSubgraph(
      config.subgraph1Url,
      queryToUse,
      config.batchSize,
      config.blockNumber1
    ),
    fetchAllUsersFromSubgraph(
      config.subgraph2Url,
      queryToUse,
      config.batchSize,
      config.blockNumber2
    ),
  ]);

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

  logInfo(`Total IDs found in subgraph1: ${totalIds1}`);
  logInfo(`Total IDs found in subgraph2: ${totalIds2}`);

  const isGotchiQuery = queryToUse.includes('gotchisOriginalOwned');
  if (isGotchiQuery) {
    logInfo('Detected gotchi query - fetching gotchi lendings...');
    const lendings1 = await fetchAllGotchiLendingsFromSubgraph(
      config.subgraph1Url,
      config.batchSize,
      config.blockNumber1
    );
    processLendingsAndUpdateOriginalOwners(users1, lendings1);
    await processVaultOwnersAndUpdateOriginalOwners(users1);
    const ethereumGotchiOwners = await fetchAllEthereumAavegotchisFromSubgraph(
      ethSubgraphUrl,
      config.batchSize
    );
    updatePolygonOriginalOwnersFromEthereum(users1, ethereumGotchiOwners);
  } else {
    logInfo('Non-gotchi query detected - skipping gotchi lendings fetch');
  }

  const excludedCount1 = users1.size;
  excludedAddresses.forEach(addr => users1.delete(addr));
  const excludedCount2 = users2.size;
  excludedAddresses.forEach(addr => users2.delete(addr));
  logInfo(`Excluded ${excludedCount1 - users1.size} contract addresses from subgraph1`);
  logInfo(`Excluded ${excludedCount2 - users2.size} contract addresses from subgraph2`);

  const filteredUsers1 = new Map<string, User>();
  let usersWithoutBalances1 = 0;

  users1.forEach((user, id) => {
    if (hasAnyBalances(user)) {
      filteredUsers1.set(id, user);
    } else {
      usersWithoutBalances1++;
    }
  });

  const filteredUsers2 = new Map<string, User>();
  let usersWithoutBalances2 = 0;

  users2.forEach((user, id) => {
    if (hasAnyBalances(user)) {
      filteredUsers2.set(id, user);
    } else {
      usersWithoutBalances2++;
    }
  });
  logInfo(`\n📊 Comparison Summary:`);
  logInfo(`Users in subgraph 1 (total): ${users1.size}`);
  logInfo(`Users in subgraph 1 (with balances): ${filteredUsers1.size}`);
  logInfo(`Users in subgraph 1 (without balances, excluded): ${usersWithoutBalances1}`);
  logInfo(`Users in subgraph 2 (total): ${users2.size}`);
  logInfo(`Users in subgraph 2 (with balances): ${filteredUsers2.size}`);
  logInfo(`Users in subgraph 2 (without balances, excluded): ${usersWithoutBalances2}`);

  const allUserIds = new Set([...filteredUsers1.keys(), ...filteredUsers2.keys()]);
  logInfo(`Total unique users (after filtering): ${allUserIds.size}`);

  const differences = [] as any[];
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

  const currentDate = new Date().toISOString().split('T')[0];
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

  logSuccess(`\nResults saved to: ${outputPath}`);
  logInfo(`Found ${differences.length} users with differences`);
  logInfo(`Found ${usersOnlyInSubgraph1.length} users only in subgraph 1`);
  logInfo(`Found ${usersOnlyInSubgraph2.length} users only in subgraph 2`);

  if (differences.length > 0) {
    logInfo('\nSample differences:');
    differences.slice(0, 3).forEach(diff => {
      logInfo(`User ${diff.userId}:`);
      Object.entries(diff.differences).forEach(([key, value]) => {
        logInfo(`  ${key}: ${JSON.stringify(value, null, 2)}`);
      });
    });
  }
}

if (require.main === module) {
  main().catch(err => {
    logError(`Error in main process: ${err}`);
    process.exit(1);
  });
}

export { main };
