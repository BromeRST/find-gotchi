import { GraphQLClient, gql } from 'graphql-request';
import chalk from 'chalk';
import { InstallationInfo, InstallationsQueryResult, ChainConfig } from './types';

const BATCH_SIZE = 1000;
const REQUEST_DELAY = 300; // 300ms between requests
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

export const INSTALLATIONS_QUERY = gql`
  query GetInstallations(
    $first: Int
    $lastId: String
    $orderBy: Installation_orderBy
    $orderDirection: OrderDirection
    $block: Block_height
  ) {
    installations(
      first: $first
      where: { equipped: true, id_gt: $lastId }
      orderBy: $orderBy
      orderDirection: $orderDirection
      block: $block
    ) {
      id
      x
      y
      parcel {
        id
      }
      type {
        id
      }
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

async function fetchInstallationsBatch(
  client: GraphQLClient,
  lastId: string,
  first: number,
  blockNumber?: number
): Promise<InstallationInfo[]> {
  const variables: any = {
    first,
    lastId: lastId || '',
    orderBy: 'id',
    orderDirection: 'asc',
  };

  if (blockNumber) {
    variables.block = { number: blockNumber };
  }

  const result: InstallationsQueryResult = await client.request(INSTALLATIONS_QUERY, variables);
  return result.installations;
}

export async function fetchAllInstallations(
  chainConfig: ChainConfig
): Promise<Map<string, InstallationInfo>> {
  const client = new GraphQLClient(chainConfig.endpoint);
  const allInstallations = new Map<string, InstallationInfo>();
  let lastId = '';
  let totalFetched = 0;

  console.log(chalk.blue(`🔍 Fetching equipped installations from ${chainConfig.name}...`));

  while (true) {
    try {
      console.log(chalk.gray(`📦 Fetching batch: lastId="${lastId}", first=${BATCH_SIZE}`));

      const installations = await retryWithBackoff(
        () => fetchInstallationsBatch(client, lastId, BATCH_SIZE, chainConfig.blockNumber),
        MAX_RETRIES,
        RETRY_BASE_DELAY,
        `Fetching installations batch from ${chainConfig.name}`
      );

      if (installations.length === 0) {
        console.log(chalk.gray('📭 No more installations found, stopping pagination.'));
        break;
      }

      // Process the batch
      installations.forEach(installation => {
        allInstallations.set(installation.id, installation);
      });

      totalFetched += installations.length;
      lastId = installations[installations.length - 1].id;

      console.log(
        chalk.green(
          `✅ Fetched ${installations.length} installations. Total so far: ${totalFetched} (last id: ${lastId})`
        )
      );

      // If we got fewer than the batch size, we've reached the end
      if (installations.length < BATCH_SIZE) {
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
    chalk.blue(
      `🎉 Completed fetching from ${chainConfig.name}: ${totalFetched} total equipped installations`
    )
  );
  return allInstallations;
}
