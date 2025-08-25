import chalk from 'chalk';
import { TileInfo, TileDiscrepancy, ComparisonResult } from './types';

function normalizeValue(value: any): any {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value.toLowerCase().trim();
  }

  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return value.map(normalizeValue).sort((a, b) => {
        // For objects, sort by id field if it exists
        if (typeof a === 'object' && typeof b === 'object' && a.id && b.id) {
          return a.id.localeCompare(b.id);
        }
        return JSON.stringify(a).localeCompare(JSON.stringify(b));
      });
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

function compareTileMetadata(
  tileId: string,
  subgraph1Tile: TileInfo | undefined,
  subgraph2Tile: TileInfo | undefined
): TileDiscrepancy[] {
  const discrepancies: TileDiscrepancy[] = [];

  // Handle missing tiles
  if (!subgraph1Tile && !subgraph2Tile) {
    return discrepancies; // Should not happen, but just in case
  }

  if (!subgraph1Tile) {
    discrepancies.push({
      tileId,
      field: 'existence',
      subgraph1Value: null,
      subgraph2Value: 'exists',
      discrepancyType: 'missing_subgraph1',
    });
    return discrepancies;
  }

  if (!subgraph2Tile) {
    discrepancies.push({
      tileId,
      field: 'existence',
      subgraph1Value: 'exists',
      subgraph2Value: null,
      discrepancyType: 'missing_subgraph2',
    });
    return discrepancies;
  }

  // Compare all fields from TileInfo
  const fieldsToCompare = ['id', 'x', 'y', 'parcel', 'type'];

  for (const field of fieldsToCompare) {
    const value1 = (subgraph1Tile as any)[field];
    const value2 = (subgraph2Tile as any)[field];

    if (!compareValues(value1, value2)) {
      discrepancies.push({
        tileId,
        field,
        subgraph1Value: value1,
        subgraph2Value: value2,
        discrepancyType: 'value_mismatch',
      });
    }
  }

  return discrepancies;
}

export async function compareMetadata(
  subgraph1Data: Map<string, TileInfo>,
  subgraph2Data: Map<string, TileInfo>,
  subgraph1Name: string = 'Subgraph 1',
  subgraph2Name: string = 'Subgraph 2'
): Promise<ComparisonResult> {
  console.log(chalk.blue('🔍 Starting equipped tiles metadata comparison...'));

  const allIds = new Set([...subgraph1Data.keys(), ...subgraph2Data.keys()]);

  const discrepanciesByToken: { [tileId: string]: TileDiscrepancy[] } = {};
  const discrepanciesByField: { [fieldName: string]: number } = {};

  let totalDiscrepancies = 0;
  let identicalCount = 0;
  let discrepantCount = 0;
  const missingOnSubgraph1: string[] = [];
  const missingOnSubgraph2: string[] = [];

  console.log(chalk.gray(`Comparing ${allIds.size} unique equipped tiles...`));

  for (const tileId of allIds) {
    const subgraph1Tile = subgraph1Data.get(tileId);
    const subgraph2Tile = subgraph2Data.get(tileId);

    const tileDiscrepancies = compareTileMetadata(tileId, subgraph1Tile, subgraph2Tile);

    if (tileDiscrepancies.length > 0) {
      discrepanciesByToken[tileId] = tileDiscrepancies;
      discrepantCount++;
      totalDiscrepancies += tileDiscrepancies.length;

      // Track missing tiles
      const missingDiscrepancy = tileDiscrepancies.find(d => d.field === 'existence');
      if (missingDiscrepancy) {
        if (missingDiscrepancy.discrepancyType === 'missing_subgraph1') {
          missingOnSubgraph1.push(tileId);
        } else if (missingDiscrepancy.discrepancyType === 'missing_subgraph2') {
          missingOnSubgraph2.push(tileId);
        }
      }

      // Count discrepancies by field
      tileDiscrepancies.forEach(discrepancy => {
        discrepanciesByField[discrepancy.field] =
          (discrepanciesByField[discrepancy.field] || 0) + 1;
      });
    } else {
      identicalCount++;
    }
  }

  const result: ComparisonResult = {
    timestamp: new Date().toISOString(),
    totalCompared: allIds.size,
    totalDiscrepancies,
    missingOnSubgraph1,
    missingOnSubgraph2,
    summary: {
      identicalCount,
      discrepantCount,
      missingSubgraph1Count: missingOnSubgraph1.length,
      missingSubgraph2Count: missingOnSubgraph2.length,
      discrepanciesByField,
    },
    discrepanciesByToken,
  };

  console.log(chalk.green('✅ Equipped tiles metadata comparison completed'));
  console.log(chalk.gray(`📊 Results: ${identicalCount} identical, ${discrepantCount} discrepant`));
  console.log(
    chalk.gray(
      `📊 Missing: ${missingOnSubgraph1.length} on ${subgraph1Name}, ${missingOnSubgraph2.length} on ${subgraph2Name}`
    )
  );

  return result;
}
