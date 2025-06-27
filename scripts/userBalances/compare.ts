import { User, UserComparison } from './types';

export function compareArrays<T>(
  arr1: T[],
  arr2: T[],
  keyExtractor: (item: T) => string
): {
  onlyInFirst: T[];
  onlyInSecond: T[];
  inBoth: T[];
} {
  const set1 = new Map(arr1.map(item => [keyExtractor(item), item]));
  const set2 = new Map(arr2.map(item => [keyExtractor(item), item]));

  const onlyInFirst: T[] = [];
  const onlyInSecond: T[] = [];
  const inBoth: T[] = [];

  set1.forEach((item, key) => {
    if (set2.has(key)) {
      inBoth.push(item);
    } else {
      onlyInFirst.push(item);
    }
  });

  set2.forEach((item, key) => {
    if (!set1.has(key)) {
      onlyInSecond.push(item);
    }
  });

  return { onlyInFirst, onlyInSecond, inBoth };
}

export function hasAnyBalances(user: User): boolean {
  return (
    (user.gotchisOriginalOwned?.length || 0) > 0 ||
    (user.portalsOwned?.length || 0) > 0 ||
    (user.parcelsOwned?.length || 0) > 0 ||
    (user.fakeGotchiCardBalances?.length || 0) > 0 ||
    (user.fakeGotchiNFTTokens?.length || 0) > 0
  );
}

export function compareUsers(user1: User, user2: User): UserComparison | null {
  const differences: UserComparison['differences'] = {};
  let hasDifferences = false;

  const safeUser1 = {
    ...user1,
    gotchisOriginalOwned: user1.gotchisOriginalOwned || [],
    portalsOwned: user1.portalsOwned || [],
    parcelsOwned: user1.parcelsOwned || [],
    fakeGotchiCardBalances: user1.fakeGotchiCardBalances || [],
    fakeGotchiNFTTokens: user1.fakeGotchiNFTTokens || [],
  };

  const safeUser2 = {
    ...user2,
    gotchisOriginalOwned: user2.gotchisOriginalOwned || [],
    portalsOwned: user2.portalsOwned || [],
    parcelsOwned: user2.parcelsOwned || [],
    fakeGotchiCardBalances: user2.fakeGotchiCardBalances || [],
    fakeGotchiNFTTokens: user2.fakeGotchiNFTTokens || [],
  };

  const gotchisComparison = compareArrays(
    safeUser1.gotchisOriginalOwned,
    safeUser2.gotchisOriginalOwned,
    item => item.id
  );

  if (gotchisComparison.onlyInFirst.length > 0 || gotchisComparison.onlyInSecond.length > 0) {
    differences.gotchisOriginalOwned = {
      subgraph1Count: safeUser1.gotchisOriginalOwned.length,
      subgraph2Count: safeUser2.gotchisOriginalOwned.length,
      onlyInSubgraph1: gotchisComparison.onlyInFirst.map(g => g.id),
      onlyInSubgraph2: gotchisComparison.onlyInSecond.map(g => g.id),
    };
    hasDifferences = true;
  }

  const portalsComparison = compareArrays(
    safeUser1.portalsOwned,
    safeUser2.portalsOwned,
    item => item.id
  );

  if (portalsComparison.onlyInFirst.length > 0 || portalsComparison.onlyInSecond.length > 0) {
    differences.portalsOwned = {
      subgraph1Count: safeUser1.portalsOwned.length,
      subgraph2Count: safeUser2.portalsOwned.length,
      onlyInSubgraph1: portalsComparison.onlyInFirst.map(p => p.id),
      onlyInSubgraph2: portalsComparison.onlyInSecond.map(p => p.id),
    };
    hasDifferences = true;
  }

  const parcelsComparison = compareArrays(
    safeUser1.parcelsOwned,
    safeUser2.parcelsOwned,
    item => item.id
  );

  if (parcelsComparison.onlyInFirst.length > 0 || parcelsComparison.onlyInSecond.length > 0) {
    differences.parcelsOwned = {
      subgraph1Count: safeUser1.parcelsOwned.length,
      subgraph2Count: safeUser2.parcelsOwned.length,
      onlyInSubgraph1: parcelsComparison.onlyInFirst,
      onlyInSubgraph2: parcelsComparison.onlyInSecond,
    };
    hasDifferences = true;
  }

  const cardBalancesComparison = compareArrays(
    safeUser1.fakeGotchiCardBalances,
    safeUser2.fakeGotchiCardBalances,
    item => item.id
  );

  const valueDifferences = cardBalancesComparison.inBoth
    .map(item => {
      const item2 = safeUser2.fakeGotchiCardBalances.find(i => i.id === item.id);
      return item2 && item.value !== item2.value
        ? { id: item.id, subgraph1Value: item.value, subgraph2Value: item2.value }
        : null;
    })
    .filter(Boolean) as Array<{
    id: string;
    subgraph1Value: string;
    subgraph2Value: string;
  }>;

  if (
    cardBalancesComparison.onlyInFirst.length > 0 ||
    cardBalancesComparison.onlyInSecond.length > 0 ||
    valueDifferences.length > 0
  ) {
    differences.fakeGotchiCardBalances = {
      subgraph1Count: safeUser1.fakeGotchiCardBalances.length,
      subgraph2Count: safeUser2.fakeGotchiCardBalances.length,
      onlyInSubgraph1: cardBalancesComparison.onlyInFirst,
      onlyInSubgraph2: cardBalancesComparison.onlyInSecond,
      valueDifferences,
    };
    hasDifferences = true;
  }

  const nftTokensComparison = compareArrays(
    safeUser1.fakeGotchiNFTTokens,
    safeUser2.fakeGotchiNFTTokens,
    item => item.identifier
  );

  if (nftTokensComparison.onlyInFirst.length > 0 || nftTokensComparison.onlyInSecond.length > 0) {
    differences.fakeGotchiNFTTokens = {
      subgraph1Count: safeUser1.fakeGotchiNFTTokens.length,
      subgraph2Count: safeUser2.fakeGotchiNFTTokens.length,
      onlyInSubgraph1: nftTokensComparison.onlyInFirst.map(t => t.identifier),
      onlyInSubgraph2: nftTokensComparison.onlyInSecond.map(t => t.identifier),
    };
    hasDifferences = true;
  }

  return hasDifferences ? { userId: safeUser1.id, differences } : null;
}
