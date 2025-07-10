import { GraphQLClient, gql } from 'graphql-request';
import chalk from 'chalk';
import { FakeGotchiStatistic, FakeGotchiStatisticsQueryResult, ChainConfig } from './types';

const BATCH_SIZE = 1000;
const REQUEST_DELAY = 300; // 300ms between requests
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

export const FAKE_GOTCHI_STATISTICS_QUERY = gql`
  query GetFakeGotchiStatistics(
    $first: Int
    $lastId: String
    $orderBy: FakeGotchiStatistic_orderBy
    $orderDirection: OrderDirection
    $block: Block_height
  ) {
    fakeGotchiStatistics(
      first: $first
      where: { id_gt: $lastId }
      orderBy: $orderBy
      orderDirection: $orderDirection
      block: $block
    ) {
      id
      tokenIds
      amountHolder
      burned
      totalSupply
      holders {
        id
        holder {
          id
        }
        amount
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

async function fetchFakeGotchiStatisticsBatch(
  client: GraphQLClient,
  lastId: string,
  first: number,
  blockNumber?: number
): Promise<FakeGotchiStatistic[]> {
  const variables: any = {
    first,
    lastId: lastId || '',
    orderBy: 'id',
    orderDirection: 'asc',
  };

  if (blockNumber) {
    variables.block = { number: blockNumber };
  }

  const result: FakeGotchiStatisticsQueryResult = await client.request(
    FAKE_GOTCHI_STATISTICS_QUERY,
    variables
  );
  return result.fakeGotchiStatistics;
}

export async function fetchAllFakeGotchiStatistics(
  chainConfig: ChainConfig
): Promise<Map<string, FakeGotchiStatistic>> {
  const client = new GraphQLClient(chainConfig.endpoint);
  const allStatistics = new Map<string, FakeGotchiStatistic>();
  let lastId = '';
  let totalFetched = 0;

  console.log(chalk.blue(`🔍 Fetching fake gotchi statistics from ${chainConfig.name}...`));

  while (true) {
    try {
      console.log(chalk.gray(`📦 Fetching batch: lastId=${lastId}, first=${BATCH_SIZE}`));

      const statistics = await retryWithBackoff(
        () => fetchFakeGotchiStatisticsBatch(client, lastId, BATCH_SIZE, chainConfig.blockNumber),
        MAX_RETRIES,
        RETRY_BASE_DELAY,
        `Fetching fake gotchi statistics batch from ${chainConfig.name}`
      );

      if (statistics.length === 0) {
        console.log(chalk.gray('📭 No more statistics found, stopping pagination.'));
        break;
      }

      // Process the batch
      statistics.forEach(statistic => {
        allStatistics.set(statistic.id, statistic);
      });

      totalFetched += statistics.length;
      lastId = statistics[statistics.length - 1].id;

      console.log(
        chalk.green(
          `✅ Fetched ${statistics.length} statistics. Total so far: ${totalFetched} (last id: ${lastId})`
        )
      );

      // If we got fewer than the batch size, we've reached the end
      if (statistics.length < BATCH_SIZE) {
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
    chalk.blue(`🎉 Completed fetching from ${chainConfig.name}: ${totalFetched} total statistics`)
  );
  return allStatistics;
}
