import { getBuiltGraphSDK, InstallationInfoFragment } from '../.graphclient';
import fs from 'fs/promises';
import path from 'path';

const BATCH_SIZE = 1000;

async function fetchInstallationsBatch(
  sdk: ReturnType<typeof getBuiltGraphSDK>,
  skip: number,
  first: number
): Promise<InstallationInfoFragment[]> {
  try {
    const { installations } = await sdk.GetInstallationsPaginated({
      first,
      skip,
    });
    return installations as InstallationInfoFragment[];
  } catch (error) {
    console.error(`Error fetching batch starting at ${skip}:`, error);
    throw error;
  }
}

async function main() {
  const sdk = getBuiltGraphSDK();
  const allInstallations: InstallationInfoFragment[] = [];
  let skip = 0;
  let batchNumber = 1;

  try {
    while (true) {
      console.log(`Fetching batch ${batchNumber} (skip: ${skip})...`);
      const batch = await fetchInstallationsBatch(sdk, skip, BATCH_SIZE);

      if (batch.length === 0) {
        console.log('No more installations found, stopping...');
        break;
      }

      allInstallations.push(...batch);
      console.log(`Fetched ${batch.length} installations (total: ${allInstallations.length})`);

      // If we got fewer installations than requested, we've reached the end
      if (batch.length < BATCH_SIZE) {
        console.log('Reached end of installations, stopping...');
        break;
      }

      skip += BATCH_SIZE;
      batchNumber++;
    }

    // Sort installations by numeric ID
    console.log('Sorting installations by numeric ID...');
    allInstallations.sort((a, b) => parseInt(a.id) - parseInt(b.id));

    const outputPath = path.join(process.cwd(), 'data/results', 'installations.json');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(allInstallations, null, 2));

    console.log(`Successfully saved ${allInstallations.length} installations to ${outputPath}`);
  } catch (error) {
    console.error('Error in main process:', error);
    process.exit(1);
  }
}

main();
