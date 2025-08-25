export interface TileInfo {
  id: string;
  x: string;
  y: string;
  parcel: {
    id: string;
  };
  type: {
    id: string;
  };
}

export interface ChainConfig {
  name: string;
  endpoint: string;
  blockNumber?: number;
}

export interface TileDiscrepancy {
  tileId: string;
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
  discrepanciesByToken: { [tileId: string]: TileDiscrepancy[] };
}

export interface TilesQueryResult {
  tiles: TileInfo[];
}
