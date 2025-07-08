// Types and interfaces for ERC1155 cross-chain comparison

export interface TokenBalance {
  tokenId: string;
  balance: number;
}

export interface Owner {
  ownerAddress: string;
  tokenBalances: TokenBalance[];
}

export interface AlchemyOwnersResponse {
  owners: Owner[];
  pageKey?: string;
}

export interface ChainConfig {
  name: string;
  contractAddress: string;
  maxRequests?: number;
  requestDelay?: number;
  enabled?: boolean;
  blockNumber?: string; // Block number (decimal/hex) or block tag (latest, earliest, finalized)
}

export interface CollectionConfig {
  name: string;
  chains: ChainConfig[];
  apiKey: string;
}

export interface OwnerComparison {
  ownerAddress: string;
  discrepancies: {
    tokenBalanceDiffs: Array<{
      tokenId: string;
      balances: { [chainName: string]: number };
    }>;
  };
}

export interface ComparisonResult {
  collectionName: string;
  timestamp: string;
  summary: {
    totalOwners: { [chainName: string]: number };
    uniqueOwners: number;
    ownersWithDiscrepancies: number;
    tokenDiscrepancies: number;
    chainsCompared: string[];
    contractAddresses: { [chainName: string]: string };
  };
  discrepancies: OwnerComparison[];
  detailedReport: {
    ownersOnlyOnChain: { [chainName: string]: string[] };
  };
}
