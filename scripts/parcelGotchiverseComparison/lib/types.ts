export interface VerseParcelInfo {
  alphaBoost: string;
  coordinateY: string;
  coordinateX: string;
  district: string;
  fomoBoost: string;
  fudBoost: string;
  id: string;
  kekBoost: string;
  owner: string;
  parcelHash: string;
  parcelId: string;
  size: string;
  tokenId: string;
  remainingAlchemica: {
    [key: string]: string;
  };
  totalAlchemicaClaimed: {
    [key: string]: string;
  };
  surveyRound: string;
  equippedInstallations: {
    id: string;
    installationType: string;
    name: string;
    level: string;
  }[];
  equippedTiles: {
    id: string;
    tileType: string;
  }[];
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
  parcels: VerseParcelInfo[];
}
