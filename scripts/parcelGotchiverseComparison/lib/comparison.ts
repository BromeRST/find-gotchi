import chalk from 'chalk';
import { ethers } from 'ethers';
import { VerseParcelInfo, ParcelDiscrepancy, ComparisonResult } from './types';
import { ownerContractAddressesOnPolygon } from '../../lib';
import { polygonAddresses } from '../../erc1155-cross-chain-comparison/lib/chainAddresses';
import { installationsAbi } from '../../../lib/installationsAbi';
import { tilesAbi } from '../../../lib/tilesAbi';

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

// Retry function with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  context: string = 'operation'
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        console.error(
          chalk.red(`❌ ${context} failed after ${maxRetries} attempts:`),
          lastError.message
        );
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(
        chalk.yellow(
          `⚠️  ${context} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`
        )
      );
      console.log(chalk.gray(`   Error: ${lastError.message}`));

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// Contract verification function for installations
async function verifyInstallationsOnChain(
  parcelId: string,
  installationsOnlyInSubgraph2: any[]
): Promise<string[]> {
  try {
    // Set up provider and contract
    const provider = new ethers.JsonRpcProvider(
      process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
    );
    const installationContract = new ethers.Contract(
      polygonAddresses.installationDiamond,
      installationsAbi,
      provider
    );

    console.log(chalk.gray(`🔍 Verifying installations on-chain for parcel ${parcelId}...`));

    // Call contract to get actual installations for this parcel with retry logic
    const contractResult = await retryWithBackoff(
      () =>
        installationContract.installationBalancesOfToken(
          polygonAddresses.realmDiamond,
          parcelId,
          { blockTag: 73121283 } // Historical block number for consistency
        ),
      3,
      1000,
      `Installation contract call for parcel ${parcelId}`
    );

    // Extract installation IDs that exist on-chain
    const onChainInstallationIds = new Set();
    for (const item of contractResult) {
      if (item.balance && item.balance.toString() !== '0') {
        onChainInstallationIds.add(item.installationId.toString());
      }
    }

    // Check which installations from subgraph2 actually exist on-chain
    const verifiedInstallations: string[] = [];
    for (const installation of installationsOnlyInSubgraph2) {
      if (onChainInstallationIds.has(installation.id)) {
        verifiedInstallations.push(installation.id);
        console.log(
          chalk.green(`✅ Installation ${installation.id} (${installation.name}) verified on-chain`)
        );
      } else {
        console.log(
          chalk.yellow(
            `⚠️  Installation ${installation.id} (${installation.name}) not found on-chain`
          )
        );
      }
    }

    return verifiedInstallations;
  } catch (error) {
    console.error(
      chalk.red(
        `❌ Failed to verify installations on-chain for parcel ${parcelId} after all retries`
      )
    );
    console.error(
      chalk.gray(`   Final error: ${error instanceof Error ? error.message : String(error)}`)
    );
    return []; // Return empty array on error, treat as no verification
  }
}

// Contract verification function for tiles
async function verifyTilesOnChain(
  parcelId: string,
  tilesOnlyInSubgraph2: any[]
): Promise<string[]> {
  try {
    // Set up provider and contract
    const provider = new ethers.JsonRpcProvider(
      process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
    );
    const tileContract = new ethers.Contract(polygonAddresses.tilesDiamond, tilesAbi, provider);

    console.log(chalk.gray(`🔍 Verifying tiles on-chain for parcel ${parcelId}...`));

    // Call contract to get actual tiles for this parcel with retry logic
    const contractResult = await retryWithBackoff(
      () =>
        tileContract.tileBalancesOfToken(
          polygonAddresses.realmDiamond,
          parcelId,
          { blockTag: 73121283 } // Historical block number for consistency
        ),
      3,
      1000,
      `Tile contract call for parcel ${parcelId}`
    );

    // Extract tile IDs that exist on-chain
    const onChainTileIds = new Set();
    console.log(
      chalk.gray(`📊 Contract returned ${contractResult.length} tiles for parcel ${parcelId}`)
    );
    for (const item of contractResult) {
      if (item.balance && item.balance.toString() !== '0') {
        onChainTileIds.add(item.tileId.toString());
        console.log(
          chalk.gray(`   Tile ${item.tileId.toString()} has balance ${item.balance.toString()}`)
        );
      }
    }
    console.log(
      chalk.gray(`🎯 Found ${onChainTileIds.size} tiles with non-zero balances on-chain`)
    );

    // Check which tiles from subgraph2 actually exist on-chain
    const verifiedTiles: string[] = [];
    for (const tile of tilesOnlyInSubgraph2) {
      if (onChainTileIds.has(tile.id)) {
        verifiedTiles.push(tile.id);
        console.log(chalk.green(`✅ Tile ${tile.id} (${tile.tileType}) verified on-chain`));
      } else {
        console.log(chalk.yellow(`⚠️  Tile ${tile.id} (${tile.tileType}) not found on-chain`));
      }
    }

    return verifiedTiles;
  } catch (error) {
    console.error(
      chalk.red(`❌ Failed to verify tiles on-chain for parcel ${parcelId} after all retries`)
    );
    console.error(
      chalk.gray(`   Final error: ${error instanceof Error ? error.message : String(error)}`)
    );
    return []; // Return empty array on error, treat as no verification
  }
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

// Async version of createArrayDiff with contract verification for installations
async function createArrayDiffWithVerification(
  array1: any[],
  array2: any[],
  fieldName: string,
  parcelId: string
): Promise<{ subgraph1Value: any; subgraph2Value: any }> {
  const norm1 = normalizeValue(array1);
  const norm2 = normalizeValue(array2);

  // For arrays of objects with id field, show differences including modified items
  // Check both arrays to determine if we're dealing with objects that have id fields
  const hasObjectsWithId =
    (array1.length > 0 && typeof array1[0] === 'object' && array1[0].id !== undefined) ||
    (array2.length > 0 && typeof array2[0] === 'object' && array2[0].id !== undefined);

  if (hasObjectsWithId) {
    const ids1 = new Set(norm1.map((item: any) => item.id));
    const ids2 = new Set(norm2.map((item: any) => item.id));

    // Items only in subgraph1
    const onlyInSubgraph1 = norm1.filter((item: any) => !ids2.has(item.id));

    // Items only in subgraph2
    let onlyInSubgraph2 = norm2.filter((item: any) => !ids1.has(item.id));

    // Special handling for installations and tiles: verify against contract
    if (fieldName === 'equippedInstallations' && onlyInSubgraph2.length > 0) {
      console.log(
        chalk.yellow(
          `⚠️  Found ${onlyInSubgraph2.length} installations only in subgraph2 (Base) for parcel ${parcelId}`
        )
      );

      // Verify installations against contract
      const verifiedInstallationIds = await verifyInstallationsOnChain(parcelId, onlyInSubgraph2);

      if (verifiedInstallationIds.length > 0) {
        console.log(
          chalk.green(
            `✅ ${verifiedInstallationIds.length} installations verified on-chain, filtering out from discrepancy`
          )
        );

        // Remove verified installations from onlyInSubgraph2
        onlyInSubgraph2 = onlyInSubgraph2.filter(
          (installation: { id: string; installationType: string; name: string; level: string }) =>
            !verifiedInstallationIds.includes(installation.id)
        );

        if (onlyInSubgraph2.length === 0) {
          console.log(
            chalk.green(`🎉 All installations verified on-chain, no discrepancy to report`)
          );
        }
      }
    } else if (fieldName === 'equippedTiles' && onlyInSubgraph2.length > 0) {
      console.log(
        chalk.yellow(
          `⚠️  Found ${onlyInSubgraph2.length} tiles only in subgraph2 (Base) for parcel ${parcelId}`
        )
      );

      // Verify tiles against contract
      const verifiedTileIds = await verifyTilesOnChain(parcelId, onlyInSubgraph2);

      if (verifiedTileIds.length > 0) {
        console.log(
          chalk.green(
            `✅ ${verifiedTileIds.length} tiles verified on-chain, filtering out from discrepancy`
          )
        );

        // Remove verified tiles from onlyInSubgraph2
        onlyInSubgraph2 = onlyInSubgraph2.filter(
          (tile: { id: string; tileType: string }) => !verifiedTileIds.includes(tile.id)
        );

        if (onlyInSubgraph2.length === 0) {
          console.log(chalk.green(`🎉 All tiles verified on-chain, no discrepancy to report`));
        }
      }
    }

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

async function compareParcelMetadata(
  parcelId: string,
  subgraph1Parcel: VerseParcelInfo | undefined,
  subgraph2Parcel: VerseParcelInfo | undefined
): Promise<ParcelDiscrepancy[]> {
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
    // 'owner',
    'parcelHash',
    'parcelId',
    'size',
    'tokenId',
    'remainingAlchemica',
    'totalAlchemicaClaimed',
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
        let diff;

        // Use async verification for installations and tiles
        if (field === 'equippedInstallations' || field === 'equippedTiles') {
          diff = await createArrayDiffWithVerification(value1, value2, field, parcelId);
        } else {
          diff = createArrayDiff(value1, value2, field);
        }

        // Only add discrepancy if there are actual differences after verification
        if (
          diff.subgraph1Value.only_in_subgraph1.length > 0 ||
          diff.subgraph2Value.only_in_subgraph2.length > 0 ||
          diff.subgraph1Value.modified_in_subgraph1?.length > 0 ||
          diff.subgraph2Value.modified_in_subgraph2?.length > 0
        ) {
          discrepancies.push({
            tokenId: parcelId,
            field,
            subgraph1Value: diff.subgraph1Value,
            subgraph2Value: diff.subgraph2Value,
            discrepancyType: 'value_mismatch',
          });
        }
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

    const parcelDiscrepancies = await compareParcelMetadata(
      parcelId,
      subgraph1Parcel,
      subgraph2Parcel
    );

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
