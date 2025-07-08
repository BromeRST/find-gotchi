import { GraphQLClient, gql } from 'graphql-request';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { updateAavegotchiWearableSets } from '../../lib/wearableSetCalculator';

dotenv.config();

interface AavegotchiMetadata {
  activeListing: any;
  baseRarityScore: string;
  claimedAt: string;
  claimedTime: string;
  collateral: string;
  createdAt: string;
  equippedWearables: string[];
  equippedDelegatedWearables: string[];
  escrow: string;
  experience: string;
  gotchiId: string;
  hauntId: string;
  historicalPrices: any[];
  id: string;
  kinship: string;
  lending: any;
  level: string;
  locked: boolean;
  minimumStake: string;
  modifiedNumericTraits: string[];
  modifiedRarityScore: string;
  name: string;
  numericTraits: string[];
  stakedAmount: string;
  timesTraded: string;
  status: string;
  toNextLevel: string;
  usedSkillPoints: string;
  withSetsNumericTraits: string[];
  withSetsRarityScore: string;
  lastInteracted: string;
  equippedSetID: string | null;
  equippedSetName: string | null;
  owner: {
    id: string;
  };
  originalOwner: {
    id: string;
  };
}

interface ChainConfig {
  name: string;
  endpoint: string;
  blockNumber?: number;
}

interface AavegotchiDiscrepancy {
  gotchiId: string;
  field: string;
  polygonValue: any;
  baseSepoliaValue: any;
  discrepancyType: 'value_mismatch' | 'missing_polygon' | 'missing_base_sepolia';
}

interface ComparisonResult {
  timestamp: string;
  totalCompared: number;
  totalDiscrepancies: number;
  missingOnPolygon: string[];
  missingOnBaseSepolia: string[];
  summary: {
    identicalCount: number;
    discrepantCount: number;
    missingPolygonCount: number;
    missingBaseSepoliaCount: number;
    discrepanciesByField: { [fieldName: string]: number };
  };
  discrepanciesByGotchi: { [gotchiId: string]: AavegotchiDiscrepancy[] };
}

const AAVEGOTCHI_QUERY = gql`
  fragment AavegotchiInfo on Aavegotchi {
    activeListing
    baseRarityScore
    claimedTime
    collateral
    equippedWearables
    equippedDelegatedWearables
    escrow
    experience
    gotchiId
    hauntId
    historicalPrices
    id
    kinship
    lending
    level
    locked
    minimumStake
    modifiedNumericTraits
    modifiedRarityScore
    name
    numericTraits
    stakedAmount
    timesTraded
    status
    toNextLevel
    usedSkillPoints
    withSetsNumericTraits
    withSetsRarityScore
    lastInteracted
    equippedSetID
    equippedSetName
    equippedDelegatedWearables
    owner {
      id
    }
    originalOwner {
      id
    }
  }

  query GetAavegotchis(
    $first: Int
    $skip: Int
    $orderBy: Aavegotchi_orderBy
    $orderDirection: OrderDirection
    $where: Aavegotchi_filter
    $block: Block_height
  ) {
    aavegotchis(
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
      where: $where
      block: $block
    ) {
      ...AavegotchiInfo
    }
  }
`;

const BATCH_SIZE = 1000; // Fetch 1000 at a time
const MAX_ID = 25000;
const REQUEST_DELAY = 300; // 300ms between requests
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

function validateEnvironment(): void {
  if (!process.env.SUBGRAPH_KEY) {
    throw new Error('SUBGRAPH_KEY environment variable is required');
  }
}

function getChainConfigs(): ChainConfig[] {
  return [
    {
      name: 'Polygon',
      endpoint: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-matic/version/matic-add-owners-to-wearables-6/api`,
      blockNumber: 73121283,
    },
    {
      name: 'Base Sepolia',
      endpoint: `https://subgraph.satsuma-prod.com/${process.env.SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-baseSepolia/version/baseSepolia-test-mints-16/api`,
    },
  ];
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  baseDelay: number = RETRY_BASE_DELAY,
  operationName: string = 'operation'
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.warn(
        chalk.yellow(
          `${operationName} failed (attempt ${attempt}/${maxRetries}): ${lastError.message}`
        )
      );

      if (attempt === maxRetries) {
        break;
      }

      const delayMs = baseDelay * Math.pow(2, attempt - 1);
      console.log(chalk.gray(`Retrying in ${delayMs}ms...`));
      await delay(delayMs);
    }
  }

  throw new Error(`${operationName} failed after ${maxRetries} attempts: ${lastError!.message}`);
}

interface GraphQLResponse {
  aavegotchis: AavegotchiMetadata[];
}

async function fetchAavegotchisBatch(
  client: GraphQLClient,
  skip: number,
  first: number,
  blockNumber?: number
): Promise<AavegotchiMetadata[]> {
  const variables: any = {
    first,
    skip,
    orderBy: 'gotchiId',
    orderDirection: 'asc',
    where: {
      gotchiId_gte: '0',
      gotchiId_lte: MAX_ID.toString(),
    },
  };

  if (blockNumber) {
    variables.block = { number: blockNumber };
  }

  const result = await client.request<GraphQLResponse>(AAVEGOTCHI_QUERY, variables);
  return result.aavegotchis;
}

async function fetchAllAavegotchis(
  chainConfig: ChainConfig
): Promise<Map<string, AavegotchiMetadata>> {
  console.log(chalk.blue(`Fetching Aavegotchis from ${chainConfig.name}...`));

  const client = new GraphQLClient(chainConfig.endpoint);
  const aavegotchis = new Map<string, AavegotchiMetadata>();
  let skip = 0;
  let totalFetched = 0;

  while (true) {
    try {
      const batch = await retryWithBackoff(
        () => fetchAavegotchisBatch(client, skip, BATCH_SIZE, chainConfig.blockNumber),
        MAX_RETRIES,
        RETRY_BASE_DELAY,
        `Fetch batch from ${chainConfig.name} (skip: ${skip})`
      );

      if (batch.length === 0) {
        break;
      }

      for (const aavegotchi of batch) {
        aavegotchis.set(aavegotchi.gotchiId, aavegotchi);
      }

      totalFetched += batch.length;
      console.log(
        chalk.gray(
          `${chainConfig.name}: Fetched ${batch.length} Aavegotchis (total: ${totalFetched})`
        )
      );

      skip += BATCH_SIZE;
      await delay(REQUEST_DELAY);
    } catch (error) {
      console.error(chalk.red(`Error fetching from ${chainConfig.name}:`, error));
      break;
    }
  }

  console.log(chalk.green(`${chainConfig.name}: Completed fetching ${totalFetched} Aavegotchis`));
  return aavegotchis;
}

function fixPolygonWearableSets(
  polygonData: Map<string, AavegotchiMetadata>
): Map<string, AavegotchiMetadata> {
  console.log(chalk.blue('Fixing Polygon wearable set calculations...'));

  const updatedData = new Map<string, AavegotchiMetadata>();
  let processedCount = 0;

  for (const [gotchiId, gotchi] of polygonData.entries()) {
    try {
      // Update the gotchi with correct set calculations using local data
      const updatedGotchi = updateAavegotchiWearableSets(gotchi);

      updatedData.set(gotchiId, updatedGotchi);
      processedCount++;

      if (processedCount % 1000 === 0) {
        console.log(chalk.gray(`Processed ${processedCount} Aavegotchis...`));
      }
    } catch (error) {
      console.warn(
        chalk.yellow(
          `Failed to update sets for Gotchi ${gotchiId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      // Keep original data if update fails
      updatedData.set(gotchiId, gotchi);
    }
  }

  console.log(chalk.green(`Completed fixing wearable sets for ${processedCount} Aavegotchis`));
  return updatedData;
}

// Helper function to normalize values for comparison
function normalizeValue(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'string' && !isNaN(Number(item))) {
        return Number(item);
      }
      return item;
    });
  }

  if (typeof value === 'string' && !isNaN(Number(value))) {
    return Number(value);
  }

  return value;
}

function compareAavegotchiMetadata(
  gotchiId: string,
  polygonGotchi: AavegotchiMetadata | undefined,
  baseSepoliaGotchi: AavegotchiMetadata | undefined
): AavegotchiDiscrepancy[] {
  const discrepancies: AavegotchiDiscrepancy[] = [];

  if (!polygonGotchi && !baseSepoliaGotchi) {
    return discrepancies;
  }

  if (!polygonGotchi) {
    discrepancies.push({
      gotchiId,
      field: 'existence',
      polygonValue: null,
      baseSepoliaValue: 'exists',
      discrepancyType: 'missing_polygon',
    });
    return discrepancies;
  }

  if (!baseSepoliaGotchi) {
    discrepancies.push({
      gotchiId,
      field: 'existence',
      polygonValue: 'exists',
      baseSepoliaValue: null,
      discrepancyType: 'missing_base_sepolia',
    });
    return discrepancies;
  }

  // Compare all fields
  const fieldsToCompare = [
    'activeListing',
    'baseRarityScore',
    'claimedTime',
    'experience',
    'hauntId',
    'level',
    'minimumStake',
    'modifiedRarityScore',
    'name',
    'timesTraded',
    'toNextLevel',
    'usedSkillPoints',
    'withSetsRarityScore',
    'lastInteracted',
    'equippedSetID',
    'equippedSetName',
  ];

  for (const field of fieldsToCompare) {
    const polygonValue = polygonGotchi[field as keyof AavegotchiMetadata];
    const baseSepoliaValue = baseSepoliaGotchi[field as keyof AavegotchiMetadata];

    const normalizedPolygonValue = normalizeValue(polygonValue);
    const normalizedBaseSepoliaValue = normalizeValue(baseSepoliaValue);

    if (JSON.stringify(normalizedPolygonValue) !== JSON.stringify(normalizedBaseSepoliaValue)) {
      discrepancies.push({
        gotchiId,
        field,
        polygonValue,
        baseSepoliaValue,
        discrepancyType: 'value_mismatch',
      });
    }
  }

  // Compare array fields
  const arrayFields = [
    'equippedWearables',
    'historicalPrices',
    'modifiedNumericTraits',
    'numericTraits',
    'withSetsNumericTraits',
  ];

  for (const field of arrayFields) {
    const polygonValue = polygonGotchi[field as keyof AavegotchiMetadata];
    const baseSepoliaValue = baseSepoliaGotchi[field as keyof AavegotchiMetadata];

    const normalizedPolygonValue = normalizeValue(polygonValue);
    const normalizedBaseSepoliaValue = normalizeValue(baseSepoliaValue);

    if (JSON.stringify(normalizedPolygonValue) !== JSON.stringify(normalizedBaseSepoliaValue)) {
      discrepancies.push({
        gotchiId,
        field,
        polygonValue,
        baseSepoliaValue,
        discrepancyType: 'value_mismatch',
      });
    }
  }

  return discrepancies;
}

async function compareMetadata(
  polygonData: Map<string, AavegotchiMetadata>,
  baseSepoliaData: Map<string, AavegotchiMetadata>
): Promise<ComparisonResult> {
  console.log(chalk.blue('Comparing metadata between chains...'));

  const result: ComparisonResult = {
    timestamp: new Date().toISOString(),
    totalCompared: 0,
    totalDiscrepancies: 0,
    missingOnPolygon: [],
    missingOnBaseSepolia: [],
    summary: {
      identicalCount: 0,
      discrepantCount: 0,
      missingPolygonCount: 0,
      missingBaseSepoliaCount: 0,
      discrepanciesByField: {},
    },
    discrepanciesByGotchi: {},
  };

  // Get all unique gotchi IDs
  const allGotchiIds = new Set([...polygonData.keys(), ...baseSepoliaData.keys()]);

  for (const gotchiId of allGotchiIds) {
    result.totalCompared++;

    const polygonGotchi = polygonData.get(gotchiId);
    const baseSepoliaGotchi = baseSepoliaData.get(gotchiId);

    const discrepancies = compareAavegotchiMetadata(gotchiId, polygonGotchi, baseSepoliaGotchi);

    if (discrepancies.length > 0) {
      result.discrepanciesByGotchi[gotchiId] = discrepancies;
      result.totalDiscrepancies += discrepancies.length;
      result.summary.discrepantCount++;

      // Count discrepancies by field
      discrepancies.forEach(disc => {
        if (result.summary.discrepanciesByField[disc.field]) {
          result.summary.discrepanciesByField[disc.field]++;
        } else {
          result.summary.discrepanciesByField[disc.field] = 1;
        }
      });

      // Check for missing entries
      if (!polygonGotchi) {
        result.missingOnPolygon.push(gotchiId);
        result.summary.missingPolygonCount++;
      }
      if (!baseSepoliaGotchi) {
        result.missingOnBaseSepolia.push(gotchiId);
        result.summary.missingBaseSepoliaCount++;
      }
    } else {
      result.summary.identicalCount++;
    }

    if (result.totalCompared % 1000 === 0) {
      console.log(chalk.gray(`Compared ${result.totalCompared} Aavegotchis...`));
    }
  }

  console.log(chalk.green('Metadata comparison completed'));
  return result;
}

async function saveResults(result: ComparisonResult): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `aavegotchi-metadata-comparison-${timestamp}.json`;
  const outputPath = path.join(
    process.cwd(),
    'scripts/aavegotchiMetadataComparison/results',
    filename
  );

  // Create results directory if it doesn't exist
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
  console.log(chalk.green(`Results saved to: ${outputPath}`));
}

function printSummary(result: ComparisonResult): void {
  console.log(chalk.cyan('\n=== AAVEGOTCHI METADATA COMPARISON SUMMARY ==='));
  console.log(chalk.white(`Timestamp: ${result.timestamp}`));
  console.log(chalk.white(`Total Aavegotchis Compared: ${result.totalCompared}`));
  console.log(chalk.white(`Total Discrepancies Found: ${result.totalDiscrepancies}`));

  console.log(chalk.cyan('\n--- Breakdown ---'));
  console.log(chalk.green(`Identical: ${result.summary.identicalCount}`));
  console.log(chalk.yellow(`With Discrepancies: ${result.summary.discrepantCount}`));
  console.log(chalk.red(`Missing on Polygon: ${result.summary.missingPolygonCount}`));
  console.log(chalk.red(`Missing on Base Sepolia: ${result.summary.missingBaseSepoliaCount}`));

  // Display discrepancies by field
  const fieldDiscrepancies = Object.entries(result.summary.discrepanciesByField);
  if (fieldDiscrepancies.length > 0) {
    console.log(chalk.cyan('\n--- Discrepancies by Field ---'));
    fieldDiscrepancies
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .forEach(([field, count]) => {
        console.log(chalk.yellow(`${field}: ${count}`));
      });
  }

  if (result.summary.missingPolygonCount > 0) {
    console.log(chalk.red('\n--- Missing on Polygon (first 10) ---'));
    result.missingOnPolygon.slice(0, 10).forEach(id => {
      console.log(chalk.red(`  - Gotchi ID: ${id}`));
    });
    if (result.missingOnPolygon.length > 10) {
      console.log(chalk.gray(`  ... and ${result.missingOnPolygon.length - 10} more`));
    }
  }

  if (result.summary.missingBaseSepoliaCount > 0) {
    console.log(chalk.red('\n--- Missing on Base Sepolia (first 10) ---'));
    result.missingOnBaseSepolia.slice(0, 10).forEach(id => {
      console.log(chalk.red(`  - Gotchi ID: ${id}`));
    });
    if (result.missingOnBaseSepolia.length > 10) {
      console.log(chalk.gray(`  ... and ${result.missingOnBaseSepolia.length - 10} more`));
    }
  }

  // Show sample discrepancies
  const discrepantGotchis = Object.keys(result.discrepanciesByGotchi);
  if (discrepantGotchis.length > 0) {
    console.log(chalk.yellow('\n--- Sample Discrepancies (first 5) ---'));
    discrepantGotchis.slice(0, 5).forEach(gotchiId => {
      const discrepancies = result.discrepanciesByGotchi[gotchiId];
      console.log(chalk.yellow(`\nGotchi ID: ${gotchiId}`));
      discrepancies.slice(0, 3).forEach(disc => {
        console.log(chalk.white(`  Field: ${disc.field}`));
        console.log(chalk.blue(`    Polygon: ${JSON.stringify(disc.polygonValue)}`));
        console.log(chalk.magenta(`    Base Sepolia: ${JSON.stringify(disc.baseSepoliaValue)}`));
      });
      if (discrepancies.length > 3) {
        console.log(chalk.gray(`  ... and ${discrepancies.length - 3} more discrepancies`));
      }
    });
  }

  console.log(chalk.cyan('\n=== END SUMMARY ===\n'));
}

async function main(): Promise<void> {
  try {
    console.log(chalk.cyan('Starting Aavegotchi Metadata Comparison...'));

    validateEnvironment();
    const chainConfigs = getChainConfigs();

    // Fetch data from both chains in parallel
    const [polygonDataRaw, baseSepoliaData] = await Promise.all([
      fetchAllAavegotchis(chainConfigs[0]), // Polygon
      fetchAllAavegotchis(chainConfigs[1]), // Base Sepolia
    ]);

    // Fix Polygon wearable set calculations
    const polygonData = fixPolygonWearableSets(polygonDataRaw);

    // Compare the metadata
    const comparisonResult = await compareMetadata(polygonData, baseSepoliaData);

    // Print summary
    printSummary(comparisonResult);

    // Save results
    await saveResults(comparisonResult);

    console.log(chalk.green('Aavegotchi metadata comparison completed successfully!'));
  } catch (error) {
    console.error(chalk.red('Error during comparison:'), error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { main, compareMetadata, fetchAllAavegotchis };
