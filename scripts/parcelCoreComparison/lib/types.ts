export interface CoreParcelInfo {
  activeListing: string | null;
  alphaBoost: string;
  auctionId: string | null;
  coordinateY: string;
  coordinateX: string;
  district: string;
  fomoBoost: string;
  fudBoost: string;
  historicalPrices: string[];
  id: string;
  kekBoost: string;
  owner: {
    id: string;
  };
  parcelHash: string;
  parcelId: string;
  size: string;
  timesTraded: string;
  tokenId: string;
}

export interface ChainConfig {
  name: string;
  endpoint: string;
  blockNumber?: number;
}

export interface ParcelDiscrepancy {
  tokenId: string;
  field: string;
  subgraph1Value: any;
  subgraph2Value: any;
  discrepancyType: 'value_mismatch' | 'missing_subgraph1' | 'missing_subgraph2';
}

export interface ComparisonResult {
  timestamp: string;
  totalCompared: number;
  totalDiscrepancies: number;
  missingOnSubgraph1: string[];
  missingOnSubgraph2: string[];
  summary: {
    identicalCount: number;
    discrepantCount: number;
    missingSubgraph1Count: number;
    missingSubgraph2Count: number;
    discrepanciesByField: { [fieldName: string]: number };
  };
  discrepanciesByToken: { [tokenId: string]: ParcelDiscrepancy[] };
}

export interface ParcelsQueryResult {
  parcels: CoreParcelInfo[];
}
