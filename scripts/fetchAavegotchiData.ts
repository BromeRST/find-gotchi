import { ethers } from 'ethers';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { aavegotchiAbi } from '../lib/abi';
import { polygonAddresses } from './erc1155-cross-chain-comparison/lib/chainAddresses';

dotenv.config();

// Configuration
const CONFIG = {
  POLYGON_RPC_URL: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
  AAVEGOTCHI_CONTRACT_ADDRESS: polygonAddresses.aavegotchiDiamond,
};

async function fetchAavegotchiData(tokenId: string) {
  try {
    console.log(chalk.blue(`🔍 Fetching Aavegotchi data for token ID: ${tokenId}`));
    console.log(chalk.gray(`Using RPC: ${CONFIG.POLYGON_RPC_URL}`));
    console.log(chalk.gray(`Contract: ${CONFIG.AAVEGOTCHI_CONTRACT_ADDRESS}`));

    // Create provider
    const provider = new ethers.JsonRpcProvider(CONFIG.POLYGON_RPC_URL);

    // Create contract instance
    const contract = new ethers.Contract(
      CONFIG.AAVEGOTCHI_CONTRACT_ADDRESS,
      aavegotchiAbi,
      provider
    );

    // Call getAavegotchi function
    const result = await contract.getAavegotchi(tokenId);

    console.log(chalk.green(`✅ Successfully fetched data for Aavegotchi #${tokenId}:`));
    console.log(chalk.yellow('📊 Aavegotchi Data:'));
    console.log({
      tokenId: result.tokenId.toString(),
      name: result.name,
      owner: result.owner,
      randomNumber: result.randomNumber.toString(),
      status: result.status.toString(),
      numericTraits: result.numericTraits.map((trait: any) => trait.toString()),
      modifiedNumericTraits: result.modifiedNumericTraits.map((trait: any) => trait.toString()),
      equippedWearables: result.equippedWearables.map((wearable: any) => wearable.toString()),
      collateral: result.collateral,
      escrow: result.escrow,
      stakedAmount: ethers.formatEther(result.stakedAmount),
      minimumStake: ethers.formatEther(result.minimumStake),
      kinship: result.kinship.toString(),
      lastInteracted: new Date(Number(result.lastInteracted) * 1000).toISOString(),
      experience: result.experience.toString(),
      items: result.items.map((item: any) => item.toString()),
    });
  } catch (error: any) {
    console.error(chalk.red(`❌ Error fetching Aavegotchi data:`), error.message);
    if (error.code === 'CALL_EXCEPTION') {
      console.error(
        chalk.yellow(`This could mean the token ID ${tokenId} doesn't exist or isn't claimed yet.`)
      );
    }
  }
}

async function main() {
  // Check if token ID is provided as command line argument
  const tokenId = process.argv[2];

  if (!tokenId) {
    console.log(chalk.yellow('Usage: ts-node scripts/fetchAavegotchiData.ts <tokenId>'));
    console.log(chalk.gray('Example: ts-node scripts/fetchAavegotchiData.ts 1'));
    return;
  }

  if (!CONFIG.POLYGON_RPC_URL || CONFIG.POLYGON_RPC_URL === 'https://polygon-rpc.com') {
    console.log(
      chalk.yellow(
        '⚠️  Using default RPC URL. For better performance, set POLYGON_RPC_URL in your .env file'
      )
    );
  }

  await fetchAavegotchiData(tokenId);
}

main().catch(console.error);
