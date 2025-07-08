import { GraphQLClient, gql } from 'graphql-request';
import chalk from 'chalk';
import { FakeGotchiNFTToken, FakeGotchiTokensQueryResult, ChainConfig } from './types';

const BATCH_SIZE = 1000;
const REQUEST_DELAY = 300; // 300ms between requests
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

export const FAKE_GOTCHI_QUERY = gql`
  fragment MetadataInfo on MetadataActionLog {
    id
    name
    description
    publisherName
    artistName
    fileHash
    thumbnailHash
    externalLink
    fileType
    editions
    publisher {
      id
    }
    artist {
      id
    }
    createdAt
  }

  fragment FakeGotchiNFTTokenInfo on FakeGotchiNFTToken {
    id
    identifier
    owner {
      id
    }
    metadata {
      ...MetadataInfo
    }
  }

  query GetFakeGotchis(
    $first: Int
    $lastIdentifier: BigInt
    $orderBy: FakeGotchiNFTToken_orderBy
    $orderDirection: OrderDirection
    $block: Block_height
  ) {
    fakeGotchiNFTTokens(
      first: $first
      where: { identifier_gt: $lastIdentifier }
      orderBy: $orderBy
      orderDirection: $orderDirection
      block: $block
    ) {
      ...FakeGotchiNFTTokenInfo
    }
  }
`;

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

  throw lastError!;
}

async function fetchFakeGotchisBatch(
  client: GraphQLClient,
  lastIdentifier: string,
  first: number,
  blockNumber?: number
): Promise<FakeGotchiNFTToken[]> {
  const variables: any = {
    first,
    lastIdentifier: lastIdentifier || '0',
    orderBy: 'identifier',
    orderDirection: 'asc',
  };

  if (blockNumber) {
    variables.block = { number: blockNumber };
  }

  const result: FakeGotchiTokensQueryResult = await client.request(FAKE_GOTCHI_QUERY, variables);
  return result.fakeGotchiNFTTokens;
}

export async function fetchAllFakeGotchis(
  chainConfig: ChainConfig
): Promise<Map<string, FakeGotchiNFTToken>> {
  const client = new GraphQLClient(chainConfig.endpoint);
  const allTokens = new Map<string, FakeGotchiNFTToken>();
  let lastIdentifier = '0';
  let totalFetched = 0;

  console.log(chalk.blue(`🔍 Fetching fake gotchis from ${chainConfig.name}...`));

  while (true) {
    try {
      console.log(
        chalk.gray(`📦 Fetching batch: lastIdentifier=${lastIdentifier}, first=${BATCH_SIZE}`)
      );

      const tokens = await retryWithBackoff(
        () => fetchFakeGotchisBatch(client, lastIdentifier, BATCH_SIZE, chainConfig.blockNumber),
        MAX_RETRIES,
        RETRY_BASE_DELAY,
        `Fetching fake gotchis batch from ${chainConfig.name}`
      );

      if (tokens.length === 0) {
        console.log(chalk.gray('📭 No more fake gotchis found, stopping pagination.'));
        break;
      }

      // Process the batch
      tokens.forEach(token => {
        allTokens.set(token.identifier, token);
      });

      totalFetched += tokens.length;
      lastIdentifier = tokens[tokens.length - 1].identifier;

      console.log(
        chalk.green(
          `✅ Fetched ${tokens.length} fake gotchis. Total so far: ${totalFetched} (last identifier: ${lastIdentifier})`
        )
      );

      // If we got fewer than the batch size, we've reached the end
      if (tokens.length < BATCH_SIZE) {
        console.log(chalk.gray('📭 Reached end of data (batch smaller than requested size).'));
        break;
      }

      // Delay between requests to avoid rate limiting
      await delay(REQUEST_DELAY);
    } catch (error) {
      console.error(chalk.red(`❌ Failed to fetch batch: ${error}`));
      throw error;
    }
  }

  console.log(
    chalk.blue(`🎉 Completed fetching from ${chainConfig.name}: ${totalFetched} total fake gotchis`)
  );
  return allTokens;
}
