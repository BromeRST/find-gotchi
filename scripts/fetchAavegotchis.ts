import { AavegotchiInfoFragment, getBuiltGraphSDK } from '../.graphclient';
import fs from 'fs/promises';
import path from 'path';

const BATCH_SIZE = 10000;
const TOTAL_AAVEGOTCHIS = 25000;

async function fetchAavegotchisBatch(
  sdk: ReturnType<typeof getBuiltGraphSDK>,
  skip: number,
  first: number
): Promise<AavegotchiInfoFragment[]> {
  try {
    const { aavegotchis } = await sdk.GetAavegotchisPaginated({
      first,
      skip,
      orderBy: 'gotchiId',
      orderDirection: 'asc',
    });
    return aavegotchis as AavegotchiInfoFragment[];
  } catch (error) {
    console.error(`Error fetching batch ${skip / first + 1}:`, error);
    throw error;
  }
}

async function main() {
  const sdk = getBuiltGraphSDK();
  const allAavegotchis: AavegotchiInfoFragment[] = [];

  try {
    for (let skip = 0; skip < TOTAL_AAVEGOTCHIS; skip += BATCH_SIZE) {
      console.log(`Fetching batch ${skip / BATCH_SIZE + 1}...`);
      const batch = await fetchAavegotchisBatch(
        sdk,
        skip,
        Math.min(BATCH_SIZE, TOTAL_AAVEGOTCHIS - skip)
      );
      allAavegotchis.push(...batch);
      console.log(`Fetched ${batch.length} Aavegotchis`);
    }

    const outputPath = path.join(process.cwd(), 'data/results', 'aavegotchis.json');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(allAavegotchis, null, 2));

    console.log(`Successfully saved ${allAavegotchis.length} Aavegotchis to ${outputPath}`);
  } catch (error) {
    console.error('Error in main process:', error);
    process.exit(1);
  }
}

main();
