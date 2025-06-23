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
  alchemyEndpoint: string;
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
  };
  discrepancies: OwnerComparison[];
  detailedReport: {
    ownersOnlyOnChain: { [chainName: string]: string[] };
  };
  transferAnalysis?: TransferAnalysis[];
  adjustedComparison?: ComparisonResult;
}

export interface NftTransfer {
  contract: {
    address: string;
    name?: string;
    symbol?: string;
    totalSupply?: string;
    tokenType: string;
  };
  tokenId: string;
  tokenType: string;
  title?: string;
  description?: string;
  timeLastUpdated: string;
  rawMetadata?: any;
  tokenUri?: {
    raw: string;
    gateway: string;
  };
  media?: Array<{
    raw: string;
    gateway: string;
    thumbnail?: string;
    format?: string;
    bytes?: number;
  }>;
  from: string;
  to: string;
  transactionHash: string;
  blockNumber: string;
}

export interface TransferAnalysis {
  address: string;
  transfersFound: number;
  relevantTransfers: NftTransfer[];
  blockRange: {
    from: string;
    to: string;
  };
}
