export interface FakeGotchiStatisticHolder {
  id: string;
  holder: {
    id: string;
  };
  amount: string;
}

export interface FakeGotchiStatistic {
  id: string;
  tokenIds: string[];
  amountHolder: string;
  burned: string;
  totalSupply: string;
  holders: FakeGotchiStatisticHolder[];
}

export interface ChainConfig {
  name: string;
  endpoint: string;
  blockNumber?: number;
}

export interface StatisticsDiscrepancy {
  statisticId: string;
  field: string;
  subgraph1Value: any;
  subgraph2Value: any;
  discrepancyType: 'value_mismatch' | 'missing_subgraph1' | 'missing_subgraph2';
}

export interface TokenIdComparisonResult {
  timestamp: string;
  totalStatisticsCompared: number;
  polygonOnlyTokenIds: string[];
  baseSpoliaOnlyTokenIds: string[];
  summary: {
    polygonOnlyCount: number;
    baseSepoliaOnlyCount: number;
    totalUniqueTokenIds: number;
  };
  detailedComparison: { [statisticId: string]: StatisticsDiscrepancy[] };
}

export interface FakeGotchiStatisticsQueryResult {
  fakeGotchiStatistics: FakeGotchiStatistic[];
}
