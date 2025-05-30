import { getBuiltGraphSDK, Portal } from '../.graphclient';
import fs from 'fs/promises';
import path from 'path';

const BATCH_SIZE = 10000;
const TOTAL_PORTALS = 25000;

async function fetchPortalsBatch(
  sdk: ReturnType<typeof getBuiltGraphSDK>,
  skip: number,
  first: number
): Promise<Portal[]> {
  try {
    const { portals } = await sdk.GetPortalsPaginated({
      first,
      skip,
      orderBy: 'id',
      orderDirection: 'asc',
    });
    return portals as Portal[];
  } catch (error) {
    console.error(`Error fetching batch ${skip / first + 1}:`, error);
    throw error;
  }
}

async function main() {
  const sdk = getBuiltGraphSDK();
  const allPortals: Portal[] = [];

  try {
    for (let skip = 0; skip < TOTAL_PORTALS; skip += BATCH_SIZE) {
      console.log(`Fetching batch ${skip / BATCH_SIZE + 1}...`);
      const batch = await fetchPortalsBatch(sdk, skip, Math.min(BATCH_SIZE, TOTAL_PORTALS - skip));
      allPortals.push(...batch);
      console.log(`Fetched ${batch.length} Portals`);
    }

    // Sort portals by numeric ID
    console.log('Sorting portals by numeric ID...');
    allPortals.sort((a, b) => parseInt(a.id) - parseInt(b.id));

    const outputPath = path.join(process.cwd(), 'data/results', 'portals.json');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(allPortals, null, 2));

    console.log(`Successfully saved ${allPortals.length} Portals to ${outputPath}`);
  } catch (error) {
    console.error('Error in main process:', error);
    process.exit(1);
  }
}

main();
