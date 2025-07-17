import chalk from 'chalk';
import { CoreParcelInfo, ParcelDiscrepancy, ComparisonResult } from './types';
import { ownerContractAddressesOnPolygon } from '../../lib';

function isPolygonContractAddress(ownerValue: any): boolean {
  if (!ownerValue || typeof ownerValue !== 'object' || !ownerValue.id) {
    return false;
  }

  const ownerId = ownerValue.id.toLowerCase();
  return ownerContractAddressesOnPolygon.some(address => address.toLowerCase() === ownerId);
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

function compareParcelMetadata(
  parcelId: string,
  subgraph1Parcel: CoreParcelInfo | undefined,
  subgraph2Parcel: CoreParcelInfo | undefined
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

  // Compare all fields from CoreParcelInfo
  const fieldsToCompare = [
    'activeListing',
    'alphaBoost',
    'auctionId',
    'coordinateY',
    'coordinateX',
    'district',
    'fomoBoost',
    'fudBoost',
    'historicalPrices',
    'id',
    'kekBoost',
    'owner',
    'parcelHash',
    'parcelId',
    'size',
    'timesTraded',
    'tokenId',
  ];

  for (const field of fieldsToCompare) {
    const value1 = (subgraph1Parcel as any)[field];
    const value2 = (subgraph2Parcel as any)[field];

    if (!compareValues(value1, value2)) {
      // Skip owner discrepancies when subgraph1 (Polygon) owner is a known contract address
      if (field === 'owner' && isPolygonContractAddress(value1)) {
        console.log(
          chalk.gray(
            `⚠️  Skipping owner discrepancy for parcel ${parcelId}: Polygon owner ${value1?.id} is a known contract address`
          )
        );
        continue;
      }

      discrepancies.push({
        tokenId: parcelId,
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
  subgraph1Data: Map<string, CoreParcelInfo>,
  subgraph2Data: Map<string, CoreParcelInfo>,
  subgraph1Name: string = 'Subgraph 1',
  subgraph2Name: string = 'Subgraph 2'
): Promise<ComparisonResult> {
  console.log(chalk.blue('🔍 Starting parcel metadata comparison...'));

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

  console.log(chalk.green('✅ Parcel metadata comparison completed'));
  console.log(chalk.gray(`📊 Results: ${identicalCount} identical, ${discrepantCount} discrepant`));
  console.log(
    chalk.gray(
      `📊 Missing: ${missingOnSubgraph1.length} on ${subgraph1Name}, ${missingOnSubgraph2.length} on ${subgraph2Name}`
    )
  );

  return result;
}
