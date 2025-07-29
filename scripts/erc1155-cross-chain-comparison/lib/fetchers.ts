import chalk from 'chalk';
import { Alchemy, Network } from 'alchemy-sdk';
import { ChainConfig, CollectionConfig, Owner } from './types';
import { baseAddresses, baseSepoliaAddresses } from './chainAddresses';
import { polygonAddresses } from './chainAddresses';
import { ownerContractAddressesOnPolygon } from '../../lib';

// Known contract addresses that should be excluded from user ownership comparison
const KNOWN_CONTRACT_ADDRESSES = new Set([
  // Polygon contract addresses
  polygonAddresses.realmDiamond.toLowerCase(),
  polygonAddresses.installationDiamond.toLowerCase(),
  polygonAddresses.tilesDiamond.toLowerCase(),
  polygonAddresses.aavegotchiDiamond.toLowerCase(),
  polygonAddresses.wearableDiamond.toLowerCase(),
  polygonAddresses.forgeDiamond.toLowerCase(),
  polygonAddresses.gbmDiamond.toLowerCase(),
  polygonAddresses.fakeGotchisNFT.toLowerCase(),
  polygonAddresses.fakeCardsDiamond.toLowerCase(),
  polygonAddresses.maticBurnAddress.toLowerCase(),

  // Base contract addresses
  // baseAddresses.realmDiamond.toLowerCase(),
  // baseAddresses.installationDiamond.toLowerCase(),
  // baseAddresses.tilesDiamond.toLowerCase(),
  // baseAddresses.aavegotchiDiamond.toLowerCase(),
  // baseAddresses.wearableDiamond.toLowerCase(),
  // baseAddresses.forgeDiamond.toLowerCase(),
  // // baseAddresses.gbmDiamond.toLowerCase(),
  // baseAddresses.fakeGotchisNFT.toLowerCase(),
  // baseAddresses.fakeCardsDiamond.toLowerCase(),
  // baseAddresses.guardianSkinsDiamond.toLowerCase(),

  // Base Sepolia contract addresses
  baseSepoliaAddresses.realmDiamond.toLowerCase(),
  baseSepoliaAddresses.installationDiamond.toLowerCase(),
  baseSepoliaAddresses.tileDiamond.toLowerCase(),
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

  // Contract addresses that should be excluded from user ownership comparison
  ...ownerContractAddressesOnPolygon,
]);

function isContractAddress(address: string): boolean {
  return KNOWN_CONTRACT_ADDRESSES.has(address.toLowerCase());
}

// Network mapping for Alchemy SDK v2
function getAlchemyNetwork(chainName: string): Network {
  switch (chainName.toLowerCase()) {
    case 'polygon':
      return Network.MATIC_MAINNET;
    case 'base':
      return Network.BASE_MAINNET;
    case 'base sepolia':
      return Network.BASE_SEPOLIA;
    default:
      throw new Error(`Unsupported chain: ${chainName}`);
  }
}

// Create Alchemy instance for a specific chain
function createAlchemyInstance(config: ChainConfig, apiKey: string): Alchemy {
  const network = getAlchemyNetwork(config.name);
  return new Alchemy({
    apiKey,
    network,
  });
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

  // Create Alchemy SDK v2 instance
  const alchemy = createAlchemyInstance(config, apiKey);

  do {
    if (requestCount >= maxRequests) {
      console.warn(
        chalk.yellow(`Warning: Reached maximum request limit (${maxRequests}) for ${config.name}`)
      );
      break;
    }

    try {
      console.log(
        `  Request ${requestCount + 1} for ${config.name}${pageKey ? ` (page: ${pageKey.slice(0, 8)}...)` : ''}`
      );

      // Use Alchemy SDK v2 to get owners for contract with token balances
      const options: any = {
        withTokenBalances: true,
      };

      if (pageKey) {
        options.pageKey = pageKey;
      }

      // Add blockTag parameter if specified (v2 uses blockTag instead of block)
      if (config.blockNumber) {
        console.log(chalk.blue(`Adding block number: ${config.blockNumber}`));
        options.block = Number(config.blockNumber);
      }

      const response = await alchemy.nft.getOwnersForContract(config.contractAddress, options);

      if (response.owners && response.owners.length > 0) {
        // Convert Alchemy SDK v2 response to our format
        const convertedOwners: Owner[] = response.owners.map((owner: any) => ({
          ownerAddress: owner.ownerAddress,
          tokenBalances: owner.tokenBalances.map((balance: any) => ({
            tokenId: balance.tokenId.startsWith('0x')
              ? parseInt(balance.tokenId, 16).toString()
              : balance.tokenId,
            balance: parseInt(balance.balance, 10),
          })),
        }));

        // Filter out known contract addresses and zero address
        const filteredOwners = convertedOwners.filter(
          owner => !isContractAddress(owner.ownerAddress)
        );
        allOwners.push(...filteredOwners);
        console.log(
          `  Fetched ${response.owners.length} owners (${filteredOwners.length} after filtering contract addresses). Total so far: ${allOwners.length}`
        );
      }

      pageKey = response.pageKey;
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
