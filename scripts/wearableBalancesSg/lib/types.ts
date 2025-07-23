export interface Owner {
  owner: string;
  balance: string;
}

export interface ItemTypeResponse {
  itemType: {
    owners: Owner[];
  } | null;
}

export interface OnChainBalance {
  address: string;
  balance: string;
}

export interface BalanceComparison {
  address: string;
  subgraphBalance: string;
  onChainBalance: string;
  discrepancy: string;
  discrepancyType: 'missing_from_subgraph' | 'missing_from_onchain' | 'balance_mismatch' | 'match';
}

export interface ItemAnalysis {
  itemId: string;
  totalSubgraphOwners: number;
  totalOnChainOwners: number;
  totalSubgraphBalance: string;
  totalOnChainBalance: string;
  balancesMatch: boolean;
  discrepancies: BalanceComparison[];
}

export interface ComparisonResult {
  timestamp: string;
  totalItemsChecked: number;
  totalDiscrepancies: number;
  itemsWithDiscrepancies: number;
  summary: {
    totalSubgraphOwners: number;
    totalOnChainOwners: number;
    totalSubgraphBalance: string;
    totalOnChainBalance: string;
    missingFromSubgraph: number;
    missingFromOnChain: number;
    balanceMismatches: number;
  };
  itemAnalyses: ItemAnalysis[];
}

export interface Config {
  subgraphEndpoint: string;
  rpcUrl: string;
  contractAddress: string;
  blockNumber?: number;
  batchSize: number;
  maxItemId: number;
  requestDelay: number;
  maxRetries: number;
}
