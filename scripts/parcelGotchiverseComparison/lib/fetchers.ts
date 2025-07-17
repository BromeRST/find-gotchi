import { GraphQLClient, gql } from 'graphql-request';
import chalk from 'chalk';
import { VerseParcelInfo, ParcelsQueryResult, ChainConfig } from './types';

const BATCH_SIZE = 1000;
const REQUEST_DELAY = 300; // 300ms between requests
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

export const PARCEL_QUERY = gql`
  fragment VerseParcelInfo on Parcel {
    alphaBoost
    coordinateY
    coordinateX
    district
    fomoBoost
    fudBoost
    id
    kekBoost
    owner
    parcelHash
    parcelId
    size
    tokenId
    remainingAlchemica
    surveyRound
    equippedInstallations {
      id
      installationType
      name
      level
    }
    equippedTiles {
      id
      tileType
    }
  }

  query GetParcels(
    $first: Int
    $lastId: String
    $orderBy: Parcel_orderBy
    $orderDirection: OrderDirection
    $block: Block_height
  ) {
    parcels(
      first: $first
      where: { id_gt: $lastId }
      orderBy: $orderBy
      orderDirection: $orderDirection
      block: $block
    ) {
      ...VerseParcelInfo
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

async function fetchParcelsBatch(
  client: GraphQLClient,
  lastId: string,
  first: number,
  blockNumber?: number
): Promise<VerseParcelInfo[]> {
  const variables: any = {
    first,
    lastId: lastId || '',
    orderBy: 'tokenId',
    orderDirection: 'asc',
  };

  if (blockNumber) {
    variables.block = { number: blockNumber };
  }

  const result: ParcelsQueryResult = await client.request(PARCEL_QUERY, variables);
  return result.parcels;
}

export async function fetchAllParcels(
  chainConfig: ChainConfig
): Promise<Map<string, VerseParcelInfo>> {
  const client = new GraphQLClient(chainConfig.endpoint);
  const allParcels = new Map<string, VerseParcelInfo>();
  let lastId = '';
  let totalFetched = 0;

  console.log(chalk.blue(`🔍 Fetching parcels from ${chainConfig.name}...`));

  while (true) {
    try {
      console.log(chalk.gray(`📦 Fetching batch: lastId="${lastId}", first=${BATCH_SIZE}`));

      const parcels = await retryWithBackoff(
        () => fetchParcelsBatch(client, lastId, BATCH_SIZE, chainConfig.blockNumber),
        MAX_RETRIES,
        RETRY_BASE_DELAY,
        `Fetching parcels batch from ${chainConfig.name}`
      );

      if (parcels.length === 0) {
        console.log(chalk.gray('📭 No more parcels found, stopping pagination.'));
        break;
      }

      // Process the batch
      parcels.forEach(parcel => {
        allParcels.set(parcel.id, parcel);
      });

      totalFetched += parcels.length;
      lastId = parcels[parcels.length - 1].id;

      console.log(
        chalk.green(
          `✅ Fetched ${parcels.length} parcels. Total so far: ${totalFetched} (last id: ${lastId})`
        )
      );

      // If we got fewer than the batch size, we've reached the end
      if (parcels.length < BATCH_SIZE) {
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
    chalk.blue(`🎉 Completed fetching from ${chainConfig.name}: ${totalFetched} total parcels`)
  );
  return allParcels;
}
