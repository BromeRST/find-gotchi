import { CollectionConfig, ComparisonResult } from './types';
import dotenv from 'dotenv';
import { baseSepoliaAddresses } from './chainAddresses';
import { polygonAddresses } from './chainAddresses';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs/promises';

// Load environment variables from .env file
dotenv.config();

// Configuration - Can be overridden by environment variables for multi-collection runs
export function getCollectionConfig(): CollectionConfig {
  // Check if running from multi-collection script (has environment variables set)
  if (
    process.env.COLLECTION_NAME &&
    process.env.POLYGON_CONTRACT &&
    process.env.BASE_SEPOLIA_CONTRACT
  ) {
    const config: CollectionConfig = {
      name: process.env.COLLECTION_NAME,
      apiKey: process.env.ALCHEMY_API_KEY || '',
      chains: [
        {
          name: 'Polygon',
          contractAddress: process.env.POLYGON_CONTRACT,
          maxRequests: 100,
          requestDelay: 100,
          enabled: true,
          blockNumber: process.env.POLYGON_BLOCK || undefined,
        },
        {
          name: 'BaseSepolia',
          contractAddress: process.env.BASE_SEPOLIA_CONTRACT,
          maxRequests: 100,
          requestDelay: 100,
          enabled: true,
          blockNumber: process.env.BASE_SEPOLIA_BLOCK || undefined,
        },
      ],
    };

    // Remove empty block numbers
    config.chains.forEach(chain => {
      if (chain.blockNumber === '') {
        delete chain.blockNumber;
      }
    });

    return config;
  }

  // Default configuration for single collection runs
  return {
    name: 'Installations',
    apiKey: process.env.ALCHEMY_API_KEY || '',
    chains: [
      {
        name: 'Polygon',
        contractAddress: polygonAddresses.installationsDiamond,
        maxRequests: 100,
        requestDelay: 100,
        enabled: true,
        blockNumber: '72386800',
      },
      {
        name: 'BaseSepolia',
        contractAddress: baseSepoliaAddresses.installationsDiamond,
        maxRequests: 100,
        requestDelay: 100,
        enabled: true,
      },
    ],
  };
}

export async function saveResults(result: ComparisonResult): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sanitizedCollectionName = result.collectionName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const filename = `${sanitizedCollectionName}-comparison-${timestamp}.json`;
  const filePath = path.join(process.cwd(), 'data/results/erc1155', filename);

  try {
    // Ensure data directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    await fs.writeFile(filePath, JSON.stringify(result, null, 2));
    console.log(chalk.green(`\n💾 Results saved to: ${filePath}`));
  } catch (error) {
    console.error(chalk.red('Failed to save results:'), error);
  }
}
