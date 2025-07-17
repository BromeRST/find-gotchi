import chalk from 'chalk';
import { VerseParcelInfo, ParcelDiscrepancy, ComparisonResult } from './types';
import { ownerContractAddressesOnPolygon } from '../../lib';

function isPolygonContractAddress(ownerAddress: any): boolean {
  if (!ownerAddress || typeof ownerAddress !== 'string') {
    return false;
  }

  const address = ownerAddress.toLowerCase();
  return ownerContractAddressesOnPolygon.some(
    contractAddress => contractAddress.toLowerCase() === address
  );
}

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

function createArrayDiff(
  array1: any[],
  array2: any[],
  fieldName: string
): { subgraph1Value: any; subgraph2Value: any } {
  const norm1 = normalizeValue(array1);
  const norm2 = normalizeValue(array2);

  // For arrays of objects with id field, show differences including modified items
  if (array1.length > 0 && typeof array1[0] === 'object' && array1[0].id !== undefined) {
    const ids1 = new Set(norm1.map((item: any) => item.id));
    const ids2 = new Set(norm2.map((item: any) => item.id));

    // Items only in subgraph1
    const onlyInSubgraph1 = norm1.filter((item: any) => !ids2.has(item.id));

    // Items only in subgraph2
    const onlyInSubgraph2 = norm2.filter((item: any) => !ids1.has(item.id));

    // Items with same ID but different properties
    const modifiedInSubgraph1: any[] = [];
    const modifiedInSubgraph2: any[] = [];

    norm1.forEach((item1: any) => {
      const item2 = norm2.find((item: any) => item.id === item1.id);
      if (item2 && JSON.stringify(item1) !== JSON.stringify(item2)) {
        modifiedInSubgraph1.push(item1);
        modifiedInSubgraph2.push(item2);
      }
    });

    return {
      subgraph1Value: {
        only_in_subgraph1: onlyInSubgraph1,
        modified_in_subgraph1: modifiedInSubgraph1,
        total_count: array1.length,
      },
      subgraph2Value: {
        only_in_subgraph2: onlyInSubgraph2,
        modified_in_subgraph2: modifiedInSubgraph2,
        total_count: array2.length,
      },
    };
  }

  // For simple arrays, show the differences
  const diff1 = norm1.filter(
    (item: any) => !norm2.some((item2: any) => JSON.stringify(item) === JSON.stringify(item2))
  );
  const diff2 = norm2.filter(
    (item: any) => !norm1.some((item1: any) => JSON.stringify(item) === JSON.stringify(item1))
  );

  return {
    subgraph1Value: {
      only_in_subgraph1: diff1,
      total_count: array1.length,
    },
    subgraph2Value: {
      only_in_subgraph2: diff2,
      total_count: array2.length,
    },
  };
}

function compareParcelMetadata(
  parcelId: string,
  subgraph1Parcel: VerseParcelInfo | undefined,
  subgraph2Parcel: VerseParcelInfo | undefined
): ParcelDiscrepancy[] {
  const discrepancies: ParcelDiscrepancy[] = [];

  // Handle missing parcels
  if (!subgraph1Parcel && !subgraph2Parcel) {
    return discrepancies; // Should not happen, but just in case
  }

  if (!subgraph1Parcel) {
    discrepancies.push({
      tokenId: parcelId,
      field: 'existence',
      subgraph1Value: null,
      subgraph2Value: 'exists',
      discrepancyType: 'missing_subgraph1',
    });
    return discrepancies;
  }

  if (!subgraph2Parcel) {
    discrepancies.push({
      tokenId: parcelId,
      field: 'existence',
      subgraph1Value: 'exists',
      subgraph2Value: null,
      discrepancyType: 'missing_subgraph2',
    });
    return discrepancies;
  }

  // Compare all fields from VerseParcelInfo
  const fieldsToCompare = [
    'alphaBoost',
    'coordinateY',
    'coordinateX',
    'district',
    'fomoBoost',
    'fudBoost',
    'id',
    'kekBoost',
    'owner',
    'parcelHash',
    'parcelId',
    'size',
    'tokenId',
    'remainingAlchemica',
    'surveyRound',
    'equippedInstallations',
    'equippedTiles',
  ];

  for (const field of fieldsToCompare) {
    const value1 = (subgraph1Parcel as any)[field];
    const value2 = (subgraph2Parcel as any)[field];

    if (!compareValues(value1, value2)) {
      // Skip owner discrepancies when subgraph1 (Polygon) owner is a known contract address
      if (field === 'owner' && isPolygonContractAddress(value1)) {
        console.log(
          chalk.gray(
            `⚠️  Skipping owner discrepancy for parcel ${parcelId}: Polygon owner ${value1} is a known contract address`
          )
        );
        continue;
      }

      // For array fields, create a diff instead of showing full arrays
      const arrayFields = ['equippedInstallations', 'equippedTiles', 'historicalPrices'];
      if (arrayFields.includes(field) && Array.isArray(value1) && Array.isArray(value2)) {
        const diff = createArrayDiff(value1, value2, field);
        discrepancies.push({
          tokenId: parcelId,
          field,
          subgraph1Value: diff.subgraph1Value,
          subgraph2Value: diff.subgraph2Value,
          discrepancyType: 'value_mismatch',
        });
      } else {
        discrepancies.push({
          tokenId: parcelId,
          field,
          subgraph1Value: value1,
          subgraph2Value: value2,
          discrepancyType: 'value_mismatch',
        });
      }
    }
  }

  return discrepancies;
}

export async function compareMetadata(
  subgraph1Data: Map<string, VerseParcelInfo>,
  subgraph2Data: Map<string, VerseParcelInfo>,
  subgraph1Name: string = 'Subgraph 1',
  subgraph2Name: string = 'Subgraph 2'
): Promise<ComparisonResult> {
  console.log(chalk.blue('🔍 Starting parcel gotchiverse metadata comparison...'));

  const allIds = new Set([...subgraph1Data.keys(), ...subgraph2Data.keys()]);
  const discrepanciesByToken: { [tokenId: string]: ParcelDiscrepancy[] } = {};
  const discrepanciesByField: { [fieldName: string]: number } = {};

  let totalDiscrepancies = 0;
  let identicalCount = 0;
  let discrepantCount = 0;
  const missingOnSubgraph1: string[] = [];
  const missingOnSubgraph2: string[] = [];

  console.log(chalk.gray(`Comparing ${allIds.size} unique parcels...`));

  for (const parcelId of allIds) {
    const subgraph1Parcel = subgraph1Data.get(parcelId);
    const subgraph2Parcel = subgraph2Data.get(parcelId);

    const parcelDiscrepancies = compareParcelMetadata(parcelId, subgraph1Parcel, subgraph2Parcel);

    if (parcelDiscrepancies.length > 0) {
      discrepanciesByToken[parcelId] = parcelDiscrepancies;
      discrepantCount++;
      totalDiscrepancies += parcelDiscrepancies.length;

      // Track missing parcels
      const missingDiscrepancy = parcelDiscrepancies.find(d => d.field === 'existence');
      if (missingDiscrepancy) {
        if (missingDiscrepancy.discrepancyType === 'missing_subgraph1') {
          missingOnSubgraph1.push(parcelId);
        } else if (missingDiscrepancy.discrepancyType === 'missing_subgraph2') {
          missingOnSubgraph2.push(parcelId);
        }
      }

      // Count discrepancies by field
      parcelDiscrepancies.forEach(discrepancy => {
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

  console.log(chalk.green('✅ Parcel gotchiverse metadata comparison completed'));
  console.log(chalk.gray(`📊 Results: ${identicalCount} identical, ${discrepantCount} discrepant`));
  console.log(
    chalk.gray(
      `📊 Missing: ${missingOnSubgraph1.length} on ${subgraph1Name}, ${missingOnSubgraph2.length} on ${subgraph2Name}`
    )
  );

  return result;
}
