export interface MetadataInfo {
  id: string;
  name: string;
  description: string;
  publisherName: string;
  artistName: string;
  fileHash: string;
  thumbnailHash: string;
  externalLink: string;
  fileType: string;
  editions: string;
  publisher: {
    id: string;
  };
  artist: {
    id: string;
  };
  createdAt: string;
}

export interface FakeGotchiNFTToken {
  id: string;
  identifier: string;
  owner: {
    id: string;
  };
  metadata: MetadataInfo;
}

export interface ChainConfig {
  name: string;
  endpoint: string;
  blockNumber?: number;
}

export interface FakeGotchiDiscrepancy {
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
  discrepanciesByToken: { [tokenId: string]: FakeGotchiDiscrepancy[] };
}

export interface FakeGotchiTokensQueryResult {
  fakeGotchiNFTTokens: FakeGotchiNFTToken[];
}
