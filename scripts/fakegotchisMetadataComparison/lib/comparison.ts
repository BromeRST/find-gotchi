import chalk from 'chalk';
import { FakeGotchiNFTToken, FakeGotchiDiscrepancy, ComparisonResult } from './types';

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

function compareFakeGotchiMetadata(
  identifier: string,
  subgraph1Token: FakeGotchiNFTToken | undefined,
  subgraph2Token: FakeGotchiNFTToken | undefined
): FakeGotchiDiscrepancy[] {
  const discrepancies: FakeGotchiDiscrepancy[] = [];

  // Handle missing tokens
  if (!subgraph1Token && !subgraph2Token) {
    return discrepancies; // Should not happen, but just in case
  }

  if (!subgraph1Token) {
    discrepancies.push({
      tokenId: identifier,
      field: 'existence',
      subgraph1Value: null,
      subgraph2Value: 'exists',
      discrepancyType: 'missing_subgraph1',
    });
    return discrepancies;
  }

  if (!subgraph2Token) {
    discrepancies.push({
      tokenId: identifier,
      field: 'existence',
      subgraph1Value: 'exists',
      subgraph2Value: null,
      discrepancyType: 'missing_subgraph2',
    });
    return discrepancies;
  }

  // Compare top-level fields
  const fieldsToCompare = ['identifier', 'owner'];

  for (const field of fieldsToCompare) {
    const value1 = (subgraph1Token as any)[field];
    const value2 = (subgraph2Token as any)[field];

    if (!compareValues(value1, value2)) {
      discrepancies.push({
        tokenId: identifier,
        field,
        subgraph1Value: value1,
        subgraph2Value: value2,
        discrepancyType: 'value_mismatch',
      });
    }
  }

  // Compare metadata fields
  const metadataFieldsToCompare = [
    'name',
    'description',
    'publisherName',
    'artistName',
    'fileHash',
    'thumbnailHash',
    'externalLink',
    'fileType',
    'editions',
    'publisher',
    'artist',
    'createdAt',
  ];

  const metadata1 = subgraph1Token.metadata;
  const metadata2 = subgraph2Token.metadata;

  if (!metadata1 && !metadata2) {
    // Both have no metadata, that's fine
  } else if (!metadata1) {
    discrepancies.push({
      tokenId: identifier,
      field: 'metadata',
      subgraph1Value: null,
      subgraph2Value: 'exists',
      discrepancyType: 'value_mismatch',
    });
  } else if (!metadata2) {
    discrepancies.push({
      tokenId: identifier,
      field: 'metadata',
      subgraph1Value: 'exists',
      subgraph2Value: null,
      discrepancyType: 'value_mismatch',
    });
  } else {
    // Compare each metadata field
    for (const field of metadataFieldsToCompare) {
      const value1 = (metadata1 as any)[field];
      const value2 = (metadata2 as any)[field];

      if (!compareValues(value1, value2)) {
        discrepancies.push({
          tokenId: identifier,
          field: `metadata.${field}`,
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
  subgraph1Data: Map<string, FakeGotchiNFTToken>,
  subgraph2Data: Map<string, FakeGotchiNFTToken>,
  subgraph1Name: string = 'Subgraph 1',
  subgraph2Name: string = 'Subgraph 2'
): Promise<ComparisonResult> {
  console.log(chalk.blue('🔍 Starting metadata comparison...'));

  const allIdentifiers = new Set([...subgraph1Data.keys(), ...subgraph2Data.keys()]);
  const discrepanciesByToken: { [tokenId: string]: FakeGotchiDiscrepancy[] } = {};
  const discrepanciesByField: { [fieldName: string]: number } = {};

  let totalDiscrepancies = 0;
  let identicalCount = 0;
  let discrepantCount = 0;
  const missingOnSubgraph1: string[] = [];
  const missingOnSubgraph2: string[] = [];

  console.log(chalk.gray(`Comparing ${allIdentifiers.size} unique fake gotchi tokens...`));

  for (const identifier of allIdentifiers) {
    const subgraph1Token = subgraph1Data.get(identifier);
    const subgraph2Token = subgraph2Data.get(identifier);

    const tokenDiscrepancies = compareFakeGotchiMetadata(
      identifier,
      subgraph1Token,
      subgraph2Token
    );

    if (tokenDiscrepancies.length > 0) {
      discrepanciesByToken[identifier] = tokenDiscrepancies;
      discrepantCount++;
      totalDiscrepancies += tokenDiscrepancies.length;

      // Track missing tokens
      const missingDiscrepancy = tokenDiscrepancies.find(d => d.field === 'existence');
      if (missingDiscrepancy) {
        if (missingDiscrepancy.discrepancyType === 'missing_subgraph1') {
          missingOnSubgraph1.push(identifier);
        } else if (missingDiscrepancy.discrepancyType === 'missing_subgraph2') {
          missingOnSubgraph2.push(identifier);
        }
      }

      // Count discrepancies by field
      tokenDiscrepancies.forEach(discrepancy => {
        discrepanciesByField[discrepancy.field] =
          (discrepanciesByField[discrepancy.field] || 0) + 1;
      });
    } else {
      identicalCount++;
    }
  }

  const result: ComparisonResult = {
    timestamp: new Date().toISOString(),
    totalCompared: allIdentifiers.size,
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

  console.log(chalk.green('✅ Metadata comparison completed'));
  console.log(chalk.gray(`📊 Results: ${identicalCount} identical, ${discrepantCount} discrepant`));
  console.log(
    chalk.gray(
      `📊 Missing: ${missingOnSubgraph1.length} on ${subgraph1Name}, ${missingOnSubgraph2.length} on ${subgraph2Name}`
    )
  );

  return result;
}
