import { GraphQLClient, gql } from 'graphql-request';
import { ethers } from 'ethers';
import chalk from 'chalk';
import type { Owner, ItemTypeResponse, OnChainBalance, Config } from './types';
import { delay, retryWithBackoff } from './utils';

const ERC1155_ABI = [
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
  'function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids) external view returns (uint256[] memory)',
];

// Provider pool to reuse connections
const providerPool = new Map<string, ethers.JsonRpcProvider>();

function getProvider(rpcUrl: string): ethers.JsonRpcProvider {
  if (!providerPool.has(rpcUrl)) {
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      staticNetwork: true,
    });
    providerPool.set(rpcUrl, provider);
  }
  return providerPool.get(rpcUrl)!;
}

export async function fetchOwnersFromSubgraph(config: Config, itemId: string): Promise<Owner[]> {
  const client = new GraphQLClient(config.subgraphEndpoint);
  const allOwners: Owner[] = [];
  let hasMore = true;
  let skip = 0;
  const first = 1000;

  console.log(chalk.blue(`Fetching subgraph owners for item ID: ${itemId}`));

  while (hasMore) {
    const operation = async () => {
      const blockParam = config.blockNumber ? `, block: { number: ${config.blockNumber} }` : '';

      const query = gql`
        {
          itemType(id: "${itemId}"${blockParam}) {
            owners(first: ${first}, skip: ${skip}, orderBy: owner, orderDirection: desc, where: { balance_gt: "0" }) {
              owner
              balance
            }
          }
        }
      `;

      const response: ItemTypeResponse = await client.request(query);
      return response;
    };

    const response = await retryWithBackoff(
      operation,
      config.maxRetries,
      1000,
      `fetchOwnersFromSubgraph for item ${itemId}, skip ${skip}`
    );

    if (!response.itemType) {
      console.log(chalk.yellow(`No itemType found for ID: ${itemId}`));
      break;
    }

    const owners = response.itemType.owners;
    if (owners.length === 0) {
      hasMore = false;
    } else {
      allOwners.push(...owners);
      skip += first;

      if (owners.length < first) {
        hasMore = false;
      }
    }

    await delay(config.requestDelay);
  }

  console.log(chalk.green(`Found ${allOwners.length} owners for item ${itemId} in subgraph`));
  return allOwners;
}

export async function fetchOnChainBalances(
  config: Config,
  itemId: string,
  addresses: string[]
): Promise<OnChainBalance[]> {
  if (addresses.length === 0) {
    return [];
  }

  const provider = getProvider(config.rpcUrl);
  const contract = new ethers.Contract(config.contractAddress, ERC1155_ABI, provider);
  const balances: OnChainBalance[] = [];

  console.log(
    chalk.blue(`Fetching on-chain balances for ${addresses.length} addresses for item ${itemId}`)
  );

  // Process in batches to avoid RPC limits
  for (let i = 0; i < addresses.length; i += config.batchSize) {
    const batch = addresses.slice(i, i + config.batchSize);
    const itemIds = new Array(batch.length).fill(itemId);

    const operation = async () => {
      const blockTag = config.blockNumber ? config.blockNumber : 'latest';
      const batchBalances = await contract.balanceOfBatch(batch, itemIds, { blockTag });
      return batchBalances;
    };

    const batchBalances = await retryWithBackoff(
      operation,
      config.maxRetries,
      1000,
      `fetchOnChainBalances batch ${i / config.batchSize + 1} for item ${itemId}`
    );

    for (let j = 0; j < batch.length; j++) {
      const balance = batchBalances[j].toString();
      if (balance !== '0') {
        balances.push({
          address: batch[j].toLowerCase(),
          balance,
        });
      }
    }

    console.log(
      chalk.gray(
        `Processed batch ${i / config.batchSize + 1}/${Math.ceil(addresses.length / config.batchSize)} for item ${itemId}`
      )
    );
    await delay(config.requestDelay * 2); // Longer delay for contract calls
  }

  console.log(
    chalk.green(`Found ${balances.length} non-zero on-chain balances for item ${itemId}`)
  );
  return balances;
}

export async function discoverItemIds(config: Config): Promise<string[]> {
  const client = new GraphQLClient(config.subgraphEndpoint);
  const itemIds: string[] = [];

  console.log(chalk.blue('Discovering available item IDs from subgraph...'));

  for (let id = 0; id <= config.maxItemId; id++) {
    const operation = async () => {
      const blockParam = config.blockNumber ? `, block: { number: ${config.blockNumber} }` : '';

      const query = gql`
        {
          itemType(id: "${id}"${blockParam}) {
            id
            owners(first: 1, where: { balance_gt: "0" }) {
              owner
            }
          }
        }
      `;

      const response: ItemTypeResponse = await client.request(query);
      return response;
    };

    try {
      const response = await retryWithBackoff(
        operation,
        config.maxRetries,
        1000,
        `discoverItemIds for ID ${id}`
      );

      if (response.itemType && response.itemType.owners.length > 0) {
        itemIds.push(id.toString());
        console.log(chalk.gray(`Found item ID: ${id}`));
      }
    } catch (error) {
      console.log(chalk.yellow(`Failed to check item ID ${id}: ${error}`));
    }

    if (id % 100 === 0) {
      await delay(config.requestDelay);
    }
  }

  console.log(chalk.green(`Discovered ${itemIds.length} item IDs with owners`));
  return itemIds;
}
