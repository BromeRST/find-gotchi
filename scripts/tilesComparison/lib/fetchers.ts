import { GraphQLClient, gql } from 'graphql-request';
import chalk from 'chalk';
import { TileInfo, TilesQueryResult, ChainConfig } from './types';

const BATCH_SIZE = 1000;
const REQUEST_DELAY = 300; // 300ms between requests
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

export const TILES_QUERY = gql`
  query GetTiles(
    $first: Int
    $lastId: String
    $orderBy: Tile_orderBy
    $orderDirection: OrderDirection
    $block: Block_height
  ) {
    tiles(
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

async function fetchTilesBatch(
  client: GraphQLClient,
  lastId: string,
  first: number,
  blockNumber?: number
): Promise<TileInfo[]> {
  const variables: any = {
    first,
    lastId: lastId || '',
    orderBy: 'id',
    orderDirection: 'asc',
  };

  if (blockNumber) {
    variables.block = { number: blockNumber };
  }

  const result: TilesQueryResult = await client.request(TILES_QUERY, variables);
  return result.tiles;
}

export async function fetchAllTiles(chainConfig: ChainConfig): Promise<Map<string, TileInfo>> {
  const client = new GraphQLClient(chainConfig.endpoint);
  const allTiles = new Map<string, TileInfo>();
  let lastId = '';
  let totalFetched = 0;

  console.log(chalk.blue(`🔍 Fetching equipped tiles from ${chainConfig.name}...`));

  while (true) {
    try {
      console.log(chalk.gray(`📦 Fetching batch: lastId="${lastId}", first=${BATCH_SIZE}`));

      const tiles = await retryWithBackoff(
        () => fetchTilesBatch(client, lastId, BATCH_SIZE, chainConfig.blockNumber),
        MAX_RETRIES,
        RETRY_BASE_DELAY,
        `Fetching tiles batch from ${chainConfig.name}`
      );

      if (tiles.length === 0) {
        console.log(chalk.gray('📭 No more tiles found, stopping pagination.'));
        break;
      }

      // Process the batch
      tiles.forEach(tile => {
        allTiles.set(tile.id, tile);
      });

      totalFetched += tiles.length;
      lastId = tiles[tiles.length - 1].id;

      console.log(
        chalk.green(
          `✅ Fetched ${tiles.length} tiles. Total so far: ${totalFetched} (last id: ${lastId})`
        )
      );

      // If we got fewer than the batch size, we've reached the end
      if (tiles.length < BATCH_SIZE) {
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
      `🎉 Completed fetching from ${chainConfig.name}: ${totalFetched} total equipped tiles`
    )
  );
  return allTiles;
}
