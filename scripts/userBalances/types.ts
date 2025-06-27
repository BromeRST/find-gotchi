export interface User {
  id: string;
  gotchisOriginalOwned: Array<{ id: string }>;
  portalsOwned: Array<{ id: string }>;
  parcelsOwned: Array<{ id: string; parcelHash: string }>;
  fakeGotchiCardBalances: Array<{ id: string; value: string }>;
  fakeGotchiNFTTokens: Array<{ identifier: string }>;
}

export interface UsersQueryResult {
  users: User[];
}

export interface GotchiLending {
  id: string;
  gotchiTokenId: string;
  lender: string;
  gotchi: {
    owner: { id: string };
    originalOwner: { id: string };
  };
}

export interface GotchiLendingsQueryResult {
  gotchiLendings: GotchiLending[];
}

export interface EthereumAavegotchi {
  id: string;
  owner: { id: string };
}

export interface EthereumAavegotchisQueryResult {
  aavegotchis: EthereumAavegotchi[];
}

export interface UserComparison {
  userId: string;
  differences: {
    gotchisOriginalOwned?: {
      subgraph1Count: number;
      subgraph2Count: number;
      onlyInSubgraph1: string[];
      onlyInSubgraph2: string[];
    };
    portalsOwned?: {
      subgraph1Count: number;
      subgraph2Count: number;
      onlyInSubgraph1: string[];
      onlyInSubgraph2: string[];
    };
    parcelsOwned?: {
      subgraph1Count: number;
      subgraph2Count: number;
      onlyInSubgraph1: Array<{ id: string; parcelHash: string }>;
      onlyInSubgraph2: Array<{ id: string; parcelHash: string }>;
    };
    fakeGotchiCardBalances?: {
      subgraph1Count: number;
      subgraph2Count: number;
      onlyInSubgraph1: Array<{ id: string; value: string }>;
      onlyInSubgraph2: Array<{ id: string; value: string }>;
      valueDifferences: Array<{
        id: string;
        subgraph1Value: string;
        subgraph2Value: string;
      }>;
    };
    fakeGotchiNFTTokens?: {
      subgraph1Count: number;
      subgraph2Count: number;
      onlyInSubgraph1: string[];
      onlyInSubgraph2: string[];
    };
  };
}
