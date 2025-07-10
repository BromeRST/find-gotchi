import chalk from 'chalk';
import { FakeGotchiStatistic, StatisticsDiscrepancy, TokenIdComparisonResult } from './types';

function normalizeValue(value: any): any {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value.toLowerCase().trim();
  }

  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return value.map(normalizeValue).sort();
    }

    const normalized: any = {};
    for (const [key, val] of Object.entries(value)) {
      normalized[key] = normalizeValue(val);
    }
    return normalized;
  }

  return value;
}

function compareValues(value1: any, value2: any): boolean {
  const norm1 = normalizeValue(value1);
  const norm2 = normalizeValue(value2);

  return JSON.stringify(norm1) === JSON.stringify(norm2);
}

function compareStatistics(
  statisticId: string,
  polygonStatistic: FakeGotchiStatistic | undefined,
  baseSepoliaStatistic: FakeGotchiStatistic | undefined
): StatisticsDiscrepancy[] {
  const discrepancies: StatisticsDiscrepancy[] = [];

  // Handle missing statistics
  if (!polygonStatistic && !baseSepoliaStatistic) {
    return discrepancies; // Should not happen, but just in case
  }

  if (!polygonStatistic) {
    discrepancies.push({
      statisticId,
      field: 'existence',
      subgraph1Value: null,
      subgraph2Value: 'exists',
      discrepancyType: 'missing_subgraph1',
    });
    return discrepancies;
  }

  if (!baseSepoliaStatistic) {
    discrepancies.push({
      statisticId,
      field: 'existence',
      subgraph1Value: 'exists',
      subgraph2Value: null,
      discrepancyType: 'missing_subgraph2',
    });
    return discrepancies;
  }

  // Compare fields - special handling for tokenIds to show only differences
  const fieldsToCompare = ['tokenIds', 'amountHolder', 'burned', 'totalSupply'];

  for (const field of fieldsToCompare) {
    const value1 = (polygonStatistic as any)[field];
    const value2 = (baseSepoliaStatistic as any)[field];

    if (!compareValues(value1, value2)) {
      let subgraph1Value = value1;
      let subgraph2Value = value2;

      // For tokenIds, show only the differences instead of full arrays
      if (field === 'tokenIds' && Array.isArray(value1) && Array.isArray(value2)) {
        const set1 = new Set(value1);
        const set2 = new Set(value2);

        const onlyInPolygon = value1.filter(id => !set2.has(id));
        const onlyInBaseSepolia = value2.filter(id => !set1.has(id));

        subgraph1Value = onlyInPolygon.length > 0 ? onlyInPolygon : null;
        subgraph2Value = onlyInBaseSepolia.length > 0 ? onlyInBaseSepolia : null;
      }

      discrepancies.push({
        statisticId,
        field,
        subgraph1Value,
        subgraph2Value,
        discrepancyType: 'value_mismatch',
      });
    }
  }

  return discrepancies;
}

function extractAllTokenIds(statisticsData: Map<string, FakeGotchiStatistic>): Set<string> {
  const allTokenIds = new Set<string>();

  for (const statistic of statisticsData.values()) {
    if (statistic.tokenIds && Array.isArray(statistic.tokenIds)) {
      statistic.tokenIds.forEach(tokenId => {
        allTokenIds.add(tokenId);
      });
    }
  }

  return allTokenIds;
}

export async function compareTokenIds(
  polygonData: Map<string, FakeGotchiStatistic>,
  baseSepoliaData: Map<string, FakeGotchiStatistic>
): Promise<TokenIdComparisonResult> {
  console.log(chalk.blue('🔍 Starting token ID comparison...'));

  // Extract all token IDs from both datasets
  const polygonTokenIds = extractAllTokenIds(polygonData);
  const baseSepoliaTokenIds = extractAllTokenIds(baseSepoliaData);

  console.log(chalk.gray(`Polygon token IDs: ${polygonTokenIds.size}`));
  console.log(chalk.gray(`Base Sepolia token IDs: ${baseSepoliaTokenIds.size}`));

  // Find differences
  const polygonOnlyTokenIds: string[] = [];
  const baseSepoliaOnlyTokenIds: string[] = [];

  // Find token IDs that exist only on Polygon
  for (const tokenId of polygonTokenIds) {
    if (!baseSepoliaTokenIds.has(tokenId)) {
      polygonOnlyTokenIds.push(tokenId);
    }
  }

  // Find token IDs that exist only on Base Sepolia
  for (const tokenId of baseSepoliaTokenIds) {
    if (!polygonTokenIds.has(tokenId)) {
      baseSepoliaOnlyTokenIds.push(tokenId);
    }
  }

  // Sort arrays for consistent output
  polygonOnlyTokenIds.sort((a, b) => parseInt(a) - parseInt(b));
  baseSepoliaOnlyTokenIds.sort((a, b) => parseInt(a) - parseInt(b));

  // Compare statistics records
  const allStatisticIds = new Set([...polygonData.keys(), ...baseSepoliaData.keys()]);
  const detailedComparison: { [statisticId: string]: StatisticsDiscrepancy[] } = {};

  console.log(chalk.gray(`Comparing ${allStatisticIds.size} unique statistics records...`));

  for (const statisticId of allStatisticIds) {
    const polygonStatistic = polygonData.get(statisticId);
    const baseSepoliaStatistic = baseSepoliaData.get(statisticId);

    const discrepancies = compareStatistics(statisticId, polygonStatistic, baseSepoliaStatistic);

    if (discrepancies.length > 0) {
      detailedComparison[statisticId] = discrepancies;
    }
  }

  const allUniqueTokenIds = new Set([...polygonTokenIds, ...baseSepoliaTokenIds]);

  const result: TokenIdComparisonResult = {
    timestamp: new Date().toISOString(),
    totalStatisticsCompared: allStatisticIds.size,
    polygonOnlyTokenIds,
    baseSpoliaOnlyTokenIds: baseSepoliaOnlyTokenIds,
    summary: {
      polygonOnlyCount: polygonOnlyTokenIds.length,
      baseSepoliaOnlyCount: baseSepoliaOnlyTokenIds.length,
      totalUniqueTokenIds: allUniqueTokenIds.size,
    },
    detailedComparison,
  };

  console.log(chalk.green('✅ Token ID comparison completed'));
  return result;
}
