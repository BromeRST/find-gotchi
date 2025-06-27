import { GraphQLClient } from 'graphql-request';
import { buildUsersQuery, GOTCHI_LENDINGS_QUERY, ETHEREUM_AAVEGOTCHIS_QUERY } from './queries';
import { User, UsersQueryResult, GotchiLending, GotchiLendingsQueryResult, EthereumAavegotchi, EthereumAavegotchisQueryResult } from './types';

export async function fetchUsersFromSubgraph(
  client: GraphQLClient,
  skip: number,
  first: number,
  selection: string,
  blockNumber?: number
): Promise<User[]> {
  const USERS_QUERY = buildUsersQuery(selection);
  const variables: any = {
    first,
    skip,
  };

  if (blockNumber) {
    variables.block = { number: blockNumber };
  }

  const result: UsersQueryResult = await client.request(USERS_QUERY, variables);
  return result.users;
}

export async function fetchAllUsersFromSubgraph(
  subgraphUrl: string,
  selection: string,
  batchSize: number,
  blockNumber?: number
): Promise<Map<string, User>> {
  const client = new GraphQLClient(subgraphUrl);
  const allUsers = new Map<string, User>();
  let skip = 0;
  let hasMore = true;

  console.log(`Fetching users from ${subgraphUrl}...`);
  while (hasMore) {
    console.log(`Fetching batch: skip=${skip}, first=${batchSize}`);
    const users = await fetchUsersFromSubgraph(client, skip, batchSize, selection, blockNumber);

    if (users.length === 0) {
      break;
    }

    users.forEach(user => {
      allUsers.set(user.id, user);
    });

    console.log(`Fetched ${users.length} users. Total so far: ${allUsers.size}`);

    if (users.length < batchSize) {
      break;
    }

    skip += batchSize;
  }

  console.log(`Total users fetched from ${subgraphUrl}: ${allUsers.size}`);

  return allUsers;
}

export async function fetchGotchiLendingsFromSubgraph(
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

export async function fetchAllGotchiLendingsFromSubgraph(
  subgraphUrl: string,
  batchSize: number,
  blockNumber?: number
): Promise<GotchiLending[]> {
  const client = new GraphQLClient(subgraphUrl);
  const allLendings: GotchiLending[] = [];
  let skip = 0;
  let hasMore = true;

  console.log(`Fetching gotchi lendings from ${subgraphUrl}...`);

  while (hasMore) {
    console.log(`Fetching lendings batch: skip=${skip}, first=${batchSize}`);
    const lendings = await fetchGotchiLendingsFromSubgraph(client, skip, batchSize, blockNumber);

    if (lendings.length === 0) {
      break;
    }

    allLendings.push(...lendings);

    console.log(`Fetched ${lendings.length} lendings. Total so far: ${allLendings.length}`);

    if (lendings.length < batchSize) {
      break;
    }

    skip += batchSize;
  }

  console.log(`Total gotchi lendings fetched from ${subgraphUrl}: ${allLendings.length}`);

  return allLendings;
}

export async function fetchEthereumAavegotchisFromSubgraph(
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

export async function fetchAllEthereumAavegotchisFromSubgraph(
  subgraphUrl: string,
  batchSize: number
): Promise<Map<string, string>> {
  const client = new GraphQLClient(subgraphUrl);
  const allGotchis = new Map<string, string>();
  let skip = 0;
  let hasMore = true;

  console.log(`Fetching aavegotchis from Ethereum subgraph: ${subgraphUrl}...`);

  while (hasMore) {
    console.log(`Fetching ethereum gotchis batch: skip=${skip}, first=${batchSize}`);
    const gotchis = await fetchEthereumAavegotchisFromSubgraph(client, skip, batchSize);

    if (gotchis.length === 0) {
      break;
    }

    gotchis.forEach(gotchi => {
      allGotchis.set(gotchi.id, gotchi.owner.id.toLowerCase());
    });

    console.log(`Fetched ${gotchis.length} ethereum gotchis. Total so far: ${allGotchis.size}`);

    if (gotchis.length < batchSize) {
      break;
    }

    skip += batchSize;
  }

  console.log(`Total ethereum aavegotchis fetched: ${allGotchis.size}`);

  return allGotchis;
}
