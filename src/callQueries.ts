import { Contract, ethers } from 'ethers';
import { getBuiltGraphSDK } from '../.graphclient';
import { Owner } from '../lib/types';
import { AAVEGOTCHI_DIAMOND } from '../lib/utils';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const sdk = getBuiltGraphSDK();

export const findItemOwners = async (itemId: number): Promise<Owner[]> => {
  const { itemType } = await sdk.GetItemType({ id: itemId.toString() });
  return itemType?.owners || [];
};

export const findAavegotchisWithDressedItem = async (itemId: number) => {
  const { aavegotchis } = await sdk.GetAavegotchis({
    first: 1000,
    where: {
      equippedWearables_contains: [itemId],
    },
  });

  return aavegotchis.length;
};

export const findBalanceReallyOwnedFromDiamond = async (itemId: number): Promise<number> => {
  if (!process.env.RPC_URL) {
    throw new Error('RPC_URL environment variable is not set');
  }

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const abi = ['function balanceOf(address owner,uint256 id) view returns (uint256)'];
  const contract = new Contract(AAVEGOTCHI_DIAMOND, abi, provider);

  const balance = await contract.balanceOf(AAVEGOTCHI_DIAMOND, itemId);

  return Number(balance);
};
