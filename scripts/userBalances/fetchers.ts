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

  while (hasMore) {
    const users = await fetchUsersFromSubgraph(client, skip, batchSize, selection, blockNumber);

    if (users.length === 0) {
      break;
    }

    users.forEach(user => {
      allUsers.set(user.id, user);
    });

    if (users.length < batchSize) {
      break;
    }

    skip += batchSize;
  }

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

  while (hasMore) {
    const lendings = await fetchGotchiLendingsFromSubgraph(client, skip, batchSize, blockNumber);

    if (lendings.length === 0) {
      break;
    }

    allLendings.push(...lendings);

    if (lendings.length < batchSize) {
      break;
    }

    skip += batchSize;
  }

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

  while (hasMore) {
    const gotchis = await fetchEthereumAavegotchisFromSubgraph(client, skip, batchSize);

    if (gotchis.length === 0) {
      break;
    }

    gotchis.forEach(gotchi => {
      allGotchis.set(gotchi.id, gotchi.owner.id.toLowerCase());
    });

    if (gotchis.length < batchSize) {
      break;
    }

    skip += batchSize;
  }

  return allGotchis;
}
