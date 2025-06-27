import { ethers } from 'ethers';
import { polygonAddresses } from '../erc1155-cross-chain-comparison/lib/chainAddresses';
import { vaultAbi } from './vaultAbi';
import { User, GotchiLending } from './types';
import { retryWithDelay, delay } from './utils';

const VAULT_ADDRESS = '0xdd564df884fd4e217c9ee6f65b4ba6e5641eac63';

export async function getVaultOwner(tokenIds: string[]) {
  const polygonProvider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
  const vault = new ethers.Contract(VAULT_ADDRESS, vaultAbi, polygonProvider);
  const owners: Record<string, string> = {};
  const batchSize = 10;
  const delayBetweenCalls = 200;

  for (let i = 0; i < tokenIds.length; i += batchSize) {
    const batch = tokenIds.slice(i, i + batchSize);

    for (const tokenId of batch) {
      try {
        const owner = await retryWithDelay(async () => {
          return await vault.getDepositor(polygonAddresses.aavegotchiDiamond, tokenId);
        });
        owners[tokenId] = owner.toLowerCase();

        if (tokenId !== batch[batch.length - 1]) {
          await delay(delayBetweenCalls);
        }
      } catch (error) {
        console.error(`Error getting vault owner for token ${tokenId} after retries:`, error);
      }
    }

    if (i + batchSize < tokenIds.length) {
      await delay(2000);
    }
  }

  return owners;
}

export function processLendingsAndUpdateOriginalOwners(
  users: Map<string, User>,
  lendings: GotchiLending[]
): void {
  for (const lending of lendings) {
    const ownerId = lending.gotchi.owner.id.toLowerCase();
    const originalOwnerId = lending.gotchi.originalOwner.id.toLowerCase();

    if (ownerId === originalOwnerId) {
      const gotchiTokenId = lending.gotchiTokenId;
      const lenderId = lending.lender;

      users.forEach(user => {
        const gotchiToUpdate = user.gotchisOriginalOwned?.find(g => g.id === gotchiTokenId);
        if (gotchiToUpdate) {
          user.gotchisOriginalOwned = user.gotchisOriginalOwned?.filter(g => g.id !== gotchiTokenId) || [];

          if (!users.has(lenderId)) {
            users.set(lenderId, {
              id: lenderId,
              gotchisOriginalOwned: [],
              portalsOwned: [],
              parcelsOwned: [],
              fakeGotchiCardBalances: [],
              fakeGotchiNFTTokens: [],
            });
          }

          const lenderUser = users.get(lenderId)!;
          if (!lenderUser.gotchisOriginalOwned) {
            lenderUser.gotchisOriginalOwned = [];
          }
          lenderUser.gotchisOriginalOwned.push(gotchiToUpdate);
        }
      });
    }
  }
}

export async function processVaultOwnersAndUpdateOriginalOwners(users: Map<string, User>): Promise<void> {
  const vaultGotchis: string[] = [];
  const vaultAddress = VAULT_ADDRESS.toLowerCase();

  const vaultUser = users.get(vaultAddress);
  if (vaultUser?.gotchisOriginalOwned) {
    vaultUser.gotchisOriginalOwned.forEach(gotchi => {
      vaultGotchis.push(gotchi.id);
    });
  }

  if (vaultGotchis.length === 0) {
    return;
  }

  const vaultOwners = await getVaultOwner(vaultGotchis);

  if (vaultUser) {
    vaultUser.gotchisOriginalOwned = [];
  }

  Object.entries(vaultOwners).forEach(([tokenId, realOwner]) => {
    const realOwnerLower = realOwner.toLowerCase();

    if (!users.has(realOwnerLower)) {
      users.set(realOwnerLower, {
        id: realOwnerLower,
        gotchisOriginalOwned: [],
        portalsOwned: [],
        parcelsOwned: [],
        fakeGotchiCardBalances: [],
        fakeGotchiNFTTokens: [],
      });
    }

    const realOwnerUser = users.get(realOwnerLower)!;
    if (!realOwnerUser.gotchisOriginalOwned) {
      realOwnerUser.gotchisOriginalOwned = [];
    }
    realOwnerUser.gotchisOriginalOwned.push({ id: tokenId });
  });
}

export function updatePolygonOriginalOwnersFromEthereum(
  polygonUsers: Map<string, User>,
  ethereumGotchiOwners: Map<string, string>
): void {
  const gotchisToMove: Array<{ tokenId: string; fromUser: string; toUser: string }> = [];

  polygonUsers.forEach((user, userId) => {
    if (user.gotchisOriginalOwned) {
      user.gotchisOriginalOwned.forEach(gotchi => {
        const ethereumOwner = ethereumGotchiOwners.get(gotchi.id);
        if (ethereumOwner && ethereumOwner !== userId) {
          gotchisToMove.push({ tokenId: gotchi.id, fromUser: userId, toUser: ethereumOwner });
        }
      });
    }
  });

  gotchisToMove.forEach(({ tokenId, fromUser, toUser }) => {
    const currentUser = polygonUsers.get(fromUser);
    if (currentUser?.gotchisOriginalOwned) {
      currentUser.gotchisOriginalOwned = currentUser.gotchisOriginalOwned.filter(g => g.id !== tokenId);
    }

    if (!polygonUsers.has(toUser)) {
      polygonUsers.set(toUser, {
        id: toUser,
        gotchisOriginalOwned: [],
        portalsOwned: [],
        parcelsOwned: [],
        fakeGotchiCardBalances: [],
        fakeGotchiNFTTokens: [],
      });
    }

    const targetUser = polygonUsers.get(toUser)!;
    if (!targetUser.gotchisOriginalOwned) {
      targetUser.gotchisOriginalOwned = [];
    }
    targetUser.gotchisOriginalOwned.push({ id: tokenId });
  });
}
