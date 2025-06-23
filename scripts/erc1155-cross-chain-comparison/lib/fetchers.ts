import chalk from 'chalk';
import { AlchemyOwnersResponse, ChainConfig, CollectionConfig, NftTransfer, Owner } from './types';
import { baseSepoliaAddresses } from './chainAddresses';
import { polygonAddresses } from './chainAddresses';

// Known contract addresses that should be excluded from user ownership comparison
const KNOWN_CONTRACT_ADDRESSES = new Set([
  // Polygon contract addresses
  polygonAddresses.realmDiamond.toLowerCase(),
  polygonAddresses.installationsDiamond.toLowerCase(),
  polygonAddresses.tilesDiamond.toLowerCase(),
  polygonAddresses.aavegotchiDiamond.toLowerCase(),
  polygonAddresses.wearableDiamond.toLowerCase(),
  polygonAddresses.forgeDiamond.toLowerCase(),
  polygonAddresses.gbmDiamond.toLowerCase(),
  polygonAddresses.fakeGotchisNFT.toLowerCase(),
  polygonAddresses.fakeCardsDiamond.toLowerCase(),
  polygonAddresses.maticBurnAddress.toLowerCase(),

  // Base Sepolia contract addresses
  baseSepoliaAddresses.realmDiamond.toLowerCase(),
  baseSepoliaAddresses.installationsDiamond.toLowerCase(),
  baseSepoliaAddresses.tilesDiamond.toLowerCase(),
  baseSepoliaAddresses.aavegotchiDiamond.toLowerCase(),
  baseSepoliaAddresses.wearableDiamond.toLowerCase(),
  baseSepoliaAddresses.forgeDiamond.toLowerCase(),
  baseSepoliaAddresses.gbmDiamond.toLowerCase(),
  baseSepoliaAddresses.fakeGotchisNFT.toLowerCase(),
  baseSepoliaAddresses.fakeCardsDiamond.toLowerCase(),
  baseSepoliaAddresses.guardianSkinsDiamond.toLowerCase(),

  // Common addresses
  '0x000000000000000000000000000000000000dead', // burn address
  '0x0000000000000000000000000000000000000000', // zero address
]);

function isContractAddress(address: string): boolean {
  return KNOWN_CONTRACT_ADDRESSES.has(address.toLowerCase());
}

export async function fetchOwnersForContract(
  config: ChainConfig,
  apiKey: string,
  collectionName: string
): Promise<Owner[]> {
  const allOwners: Owner[] = [];
  let pageKey: string | undefined;
  let requestCount = 0;
  const maxRequests = config.maxRequests || 100;
  const requestDelay = config.requestDelay || 100;

  console.log(
    chalk.blue(
      `Fetching owners for ${collectionName} on ${config.name}${config.blockNumber ? ` at block ${config.blockNumber}` : ' (latest block)'}...`
    )
  );

  do {
    if (requestCount >= maxRequests) {
      console.warn(
        chalk.yellow(`Warning: Reached maximum request limit (${maxRequests}) for ${config.name}`)
      );
      break;
    }

    const url = new URL(`${config.alchemyEndpoint}/${apiKey}/getOwnersForContract`);
    url.searchParams.append('contractAddress', config.contractAddress);
    url.searchParams.append('withTokenBalances', 'true');

    if (pageKey) {
      url.searchParams.append('pageKey', pageKey);
    }

    // Add block parameter if specified
    if (config.blockNumber) {
      console.log(chalk.blue(`Adding block number: ${config.blockNumber}`));
      url.searchParams.append('block', config.blockNumber);
    }

    try {
      console.log(
        `  Request ${requestCount + 1} for ${config.name}${pageKey ? ` (page: ${pageKey.slice(0, 8)}...)` : ''}`
      );

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: AlchemyOwnersResponse = await response.json();

      if (data.owners && data.owners.length > 0) {
        // Filter out known contract addresses and zero address
        const filteredOwners = data.owners.filter(owner => !isContractAddress(owner.ownerAddress));
        allOwners.push(...filteredOwners);
        console.log(
          `  Fetched ${data.owners.length} owners (${filteredOwners.length} after filtering contract addresses). Total so far: ${allOwners.length}`
        );
      }

      pageKey = data.pageKey;
      requestCount++;

      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, requestDelay));
    } catch (error) {
      console.error(chalk.red(`Error fetching owners for ${config.name}:`), error);
      throw error;
    }
  } while (pageKey);

  console.log(chalk.green(`✓ Total owners fetched for ${config.name}: ${allOwners.length}`));
  return allOwners;
}

export async function fetchAllChainData(
  collectionConfig: CollectionConfig
): Promise<{ [chainName: string]: Owner[] }> {
  const results: { [chainName: string]: Owner[] } = {};

  console.log(
    chalk.cyan.bold(
      `🔗 Starting to fetch data for "${collectionConfig.name}" across all chains...\n`
    )
  );

  // Get active chains
  const activeChains = collectionConfig.chains.filter(config => config.enabled);

  if (!collectionConfig.apiKey) {
    throw new Error(
      'API key is required. Please set ALCHEMY_API_KEY in your environment variables.'
    );
  }

  for (const config of activeChains) {
    try {
      results[config.name] = await fetchOwnersForContract(
        config,
        collectionConfig.apiKey,
        collectionConfig.name
      );
    } catch (error) {
      console.error(chalk.red(`Failed to fetch data for ${config.name}:`), error);
      results[config.name] = [];
    }

    console.log(); // Add spacing between chains
  }

  return results;
}

export async function fetchTransfersForContract({
  contractAddress,
  fromBlock,
  toBlock,
  apiKey,
}: {
  contractAddress: string;
  fromBlock: string;
  toBlock: string;
  apiKey: string;
}): Promise<NftTransfer[]> {
  const url = `https://polygon-mainnet.g.alchemy.com/v2/${apiKey}`;

  // Convert block numbers to hex format if they're not already
  const fromBlockHex = fromBlock.startsWith('0x')
    ? fromBlock
    : `0x${parseInt(fromBlock).toString(16)}`;
  const toBlockHex =
    toBlock === 'latest'
      ? 'latest'
      : toBlock.startsWith('0x')
        ? toBlock
        : `0x${parseInt(toBlock).toString(16)}`;

  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'alchemy_getAssetTransfers',
    params: [
      {
        fromBlock: fromBlockHex,
        toBlock: toBlockHex,
        contractAddresses: [contractAddress],
        category: ['erc721', 'erc1155'],
        excludeZeroValue: false,
        maxCount: '0x3e8', // 1000 in hex
        order: 'asc',
      },
    ],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`API Error: ${data.error.message}`);
  }

  if (data.result && data.result.transfers) {
    console.log(
      `    📊 Found ${data.result.transfers.length} transfers for contract ${contractAddress}`
    );

    // Convert alchemy_getAssetTransfers format to our NftTransfer format
    return data.result.transfers.map((transfer: any) => ({
      contract: {
        address: contractAddress,
        tokenType: transfer.category === 'erc721' ? 'ERC721' : 'ERC1155',
      },
      tokenId:
        transfer.erc721TokenId ||
        (transfer.erc1155Metadata && transfer.erc1155Metadata.length > 0
          ? transfer.erc1155Metadata[0].tokenId
          : '0'),
      tokenType: transfer.category === 'erc721' ? 'ERC721' : 'ERC1155',
      from: transfer.from,
      to: transfer.to,
      transactionHash: transfer.hash,
      blockNumber: transfer.blockNum,
    }));
  }

  return [];
}
