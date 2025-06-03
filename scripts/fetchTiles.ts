import { getBuiltGraphSDK, TileInfoFragment } from '../.graphclient';
import fs from 'fs/promises';
import path from 'path';

const BATCH_SIZE = 1000;

async function fetchTilesBatch(
  sdk: ReturnType<typeof getBuiltGraphSDK>,
  skip: number,
  first: number
): Promise<TileInfoFragment[]> {
  try {
    const { tiles } = await sdk.GetTilesPaginated({
      first,
      skip,
    });
    return tiles as TileInfoFragment[];
  } catch (error) {
    console.error(`Error fetching batch starting at ${skip}:`, error);
    throw error;
  }
}

async function main() {
  const sdk = getBuiltGraphSDK();
  const allTiles: TileInfoFragment[] = [];
  let skip = 0;
  let batchNumber = 1;

  try {
    while (true) {
      console.log(`Fetching batch ${batchNumber} (skip: ${skip})...`);
      const batch = await fetchTilesBatch(sdk, skip, BATCH_SIZE);

      if (batch.length === 0) {
        console.log('No more tiles found, stopping...');
        break;
      }

      allTiles.push(...batch);
      console.log(`Fetched ${batch.length} tiles (total: ${allTiles.length})`);

      // If we got fewer tiles than requested, we've reached the end
      if (batch.length < BATCH_SIZE) {
        console.log('Reached end of tiles, stopping...');
        break;
      }

      skip += BATCH_SIZE;
      batchNumber++;
    }

    // Sort tiles by numeric ID
    console.log('Sorting tiles by numeric ID...');
    allTiles.sort((a, b) => parseInt(a.id) - parseInt(b.id));

    const outputPath = path.join(process.cwd(), 'data/results', 'tiles.json');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(allTiles, null, 2));

    console.log(`Successfully saved ${allTiles.length} tiles to ${outputPath}`);
  } catch (error) {
    console.error('Error in main process:', error);
    process.exit(1);
  }
}

main();
