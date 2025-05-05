import * as fs from 'fs';
import * as path from 'path';
import { itemTypes } from '../../lib/itemTypes';
import { log } from '../../lib/logger';
import {
  findAavegotchisWithDressedItem,
  findBalanceReallyOwnedFromDiamond,
  findItemOwners,
} from '../callQueries';
import { AAVEGOTCHI_DIAMOND } from '../../lib/utils';
import { ErrorResult, GotchisData } from '../../lib/types';

// Configuration
const CONFIG = {
  // Number of items to process in a batch before pausing
  BATCH_SIZE: 5,
  // Delay between items within a batch (in ms)
  ITEM_DELAY: 1000,
  // Delay between batches (in ms)
  BATCH_DELAY: 5000,
  // Output file path
  OUTPUT_FILE: './item-errors.json',
};

// Read the gotchi metadata JSON file
const readGotchiData = (): GotchisData => {
  try {
    const filePath = path.resolve(process.cwd(), './lib/aavegotchiMetadata.json');
    log.info(`Looking for metadata file at: ${filePath}`);
    if (!fs.existsSync(filePath)) {
      // Try another path if the first one doesn't exist
      const rootPath = path.resolve(process.cwd(), '../aavegotchiMetadata.json');
      log.info(`Trying alternative path: ${rootPath}`);
      if (fs.existsSync(rootPath)) {
        const data = fs.readFileSync(rootPath, 'utf8');
        return JSON.parse(data);
      } else {
        throw new Error(
          `Could not find aavegotchiMetadata.json at either ${filePath} or ${rootPath}`
        );
      }
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    log.error(`Error reading file: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

// Find gotchis with item in inventory but not equipped
const findGotchisWithItemNotEquipped = (gotchisObject: GotchisData, itemId: number): number => {
  let count = 0;

  Object.entries(gotchisObject).forEach(([_, gotchi]) => {
    // Check if gotchi has item in inventory
    const hasItem = gotchi.items.includes(itemId);

    // Check if gotchi doesn't have item equipped
    const notEquippedItem = !gotchi.equippedWearables?.includes(itemId);

    // If both conditions are true, increment the count
    if (hasItem && notEquippedItem) {
      count++;
    }
  });

  return count;
};

// Function to run checks for a single item ID
async function runChecksForItem(itemId: number): Promise<ErrorResult | null> {
  try {
    log.info(`Checking item ID: ${itemId} (${itemTypes[itemId]?.name || 'Unknown'})`);

    // Skip item ID 0 (The Void) or invalid IDs
    if (itemId === 0 || !itemTypes[itemId]) {
      log.warning(`Skipping item ID ${itemId} (not a valid item)`);
      return null;
    }

    const ownersOfItem = await findItemOwners(itemId);
    const aavegotchisWithDressedItem = await findAavegotchisWithDressedItem(itemId);

    const ownersTotalBalance = ownersOfItem.reduce((acc, { balance }) => acc + Number(balance), 0);

    const aavegotchiDiamondBalance =
      ownersOfItem.filter(({ owner }) => owner === AAVEGOTCHI_DIAMOND)[0]?.balance || 0;

    const itemType = itemTypes[itemId];
    log.info(`Aavegotchi Diamond balance: ${aavegotchiDiamondBalance}`);
    log.info(`Item max quantity: ${itemType.maxQuantity}`);

    // Check 0: Diamond balance should match item max quantity
    const check0Result = Number(ownersTotalBalance) === itemType.maxQuantity;
    log.check(
      'Check 0',
      check0Result,
      `Owners total balance (${ownersTotalBalance}) ${check0Result ? '===' : '!=='} item max quantity (${itemType.maxQuantity})`
    );

    if (!check0Result) {
      return {
        itemId,
        itemName: itemType.name,
        maxQuantity: itemType.maxQuantity,
        errorType: 'check0',
        errorData: {
          ownersTotal: ownersTotalBalance,
        },
        message: `Owners total balance (${ownersTotalBalance}) !== item max quantity (${itemType.maxQuantity})`,
      };
    }

    // Check 1: aavegotchiDiamond balance === aavegotchis length
    const check1Result = Number(aavegotchiDiamondBalance) === aavegotchisWithDressedItem;
    log.check(
      'Check 1',
      check1Result,
      `Diamond balance (${aavegotchiDiamondBalance}) ${check1Result ? '===' : '!=='} aavegotchis with dressed item (${aavegotchisWithDressedItem})`
    );

    if (check1Result) {
      log.success(`All checks passed for item ${itemId} (${itemType.name})`);
      return null;
    }

    // Get additional data needed for next checks
    const balanceReallyOwnedFromDiamond = await findBalanceReallyOwnedFromDiamond(itemId);
    log.info(`Balance really owned from Diamond: ${balanceReallyOwnedFromDiamond}`);

    // Check 2: aavegotchi diamond balance === aavegotchis length + balanceReallyOwnedFromDiamond
    const check2Sum = aavegotchisWithDressedItem + Number(balanceReallyOwnedFromDiamond);
    const check2Result = Number(aavegotchiDiamondBalance) === check2Sum;
    log.check(
      'Check 2',
      check2Result,
      `Diamond balance (${aavegotchiDiamondBalance}) ${check2Result ? '===' : '!=='} ` +
        `aavegotchis with dressed item (${aavegotchisWithDressedItem}) + ` +
        `balance really owned from Diamond (${balanceReallyOwnedFromDiamond})`
    );

    if (check2Result) {
      log.success(`Checks passed for item ${itemId} (${itemType.name}) at check 2`);
      return null;
    }

    // Check 3: Check for gotchis with item in inventory but not equipped
    try {
      const gotchisData = readGotchiData();
      const countGotchisWithItemNotEquipped = findGotchisWithItemNotEquipped(gotchisData, itemId);
      log.info(
        `Found ${countGotchisWithItemNotEquipped} gotchis with item ${itemId} in inventory but not equipped`
      );

      // Check 3: aavegotchiDiamondBalance === aavegotchis length + balanceReallyOwnedFromDiamond + countGotchisWithItemNotEquipped
      const check3Sum =
        aavegotchisWithDressedItem +
        Number(balanceReallyOwnedFromDiamond) +
        countGotchisWithItemNotEquipped;
      const check3Result = Number(aavegotchiDiamondBalance) === check3Sum;
      log.check(
        'Check 3',
        check3Result,
        `Diamond balance (${aavegotchiDiamondBalance}) ${check3Result ? '===' : '!=='} ` +
          `aavegotchis with dressed item (${aavegotchisWithDressedItem}) + ` +
          `balance really owned from Diamond (${balanceReallyOwnedFromDiamond}) + ` +
          `gotchis with item in pocket (${countGotchisWithItemNotEquipped})`
      );

      if (check3Result) {
        log.success(`Checks passed for item ${itemId} (${itemType.name}) at check 3`);
        return null;
      }

      return {
        itemId,
        itemName: itemType.name,
        maxQuantity: itemType.maxQuantity,
        errorType: 'check3',
        errorData: {
          aavegotchiDiamondBalance: Number(aavegotchiDiamondBalance),
          aavegotchisWithDressedItem,
          balanceReallyOwned: Number(balanceReallyOwnedFromDiamond),
          gotchisWithItemNotEquipped: countGotchisWithItemNotEquipped,
          discrepancy:
            Number(aavegotchiDiamondBalance) -
            (aavegotchisWithDressedItem +
              Number(balanceReallyOwnedFromDiamond) +
              countGotchisWithItemNotEquipped),
        },
        message: `Diamond balance (${aavegotchiDiamondBalance}) !== aavegotchis with dressed item (${aavegotchisWithDressedItem}) + balance really owned from Diamond (${balanceReallyOwnedFromDiamond}) + gotchis with item in pocket (${countGotchisWithItemNotEquipped})`,
      };
    } catch (error) {
      log.error(`Error during Check 3: ${error instanceof Error ? error.message : String(error)}`);
      // Fall back to check2 error if check3 fails due to file access or other issues
      return {
        itemId,
        itemName: itemType.name,
        maxQuantity: itemType.maxQuantity,
        errorType: 'check2',
        errorData: {
          aavegotchiDiamondBalance: Number(aavegotchiDiamondBalance),
          aavegotchisWithDressedItem,
          balanceReallyOwned: Number(balanceReallyOwnedFromDiamond),
          discrepancy:
            Number(aavegotchiDiamondBalance) -
            (aavegotchisWithDressedItem + Number(balanceReallyOwnedFromDiamond)),
        },
        message: `Diamond balance (${aavegotchiDiamondBalance}) !== aavegotchis with dressed item (${aavegotchisWithDressedItem}) + balance really owned from Diamond (${balanceReallyOwnedFromDiamond})`,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Error checking item ID ${itemId}: ${errorMessage}`);

    return {
      itemId,
      itemName: itemTypes[itemId]?.name || 'Unknown',
      maxQuantity: itemTypes[itemId]?.maxQuantity || 0,
      errorType: 'check0', // Default error type
      errorData: {},
      message: errorMessage,
    };
  }
}

// Helper function to process a batch of items
async function processBatch(
  itemIds: number[],
  errors: ErrorResult[],
  outputFilePath: string
): Promise<ErrorResult[]> {
  const localErrors = [...errors];

  for (let i = 0; i < itemIds.length; i++) {
    const itemId = itemIds[i];

    try {
      const result = await runChecksForItem(itemId);
      if (result) {
        localErrors.push(result);
        log.error(`Error found for item ${itemId} (${result.itemName}): ${result.message}`);

        // Write to file as we go to prevent data loss in case of a crash
        fs.writeFileSync(outputFilePath, JSON.stringify(localErrors, null, 2));
        log.info(`Updated error report at ${outputFilePath}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Failed to check item ${itemId}: ${errorMessage}`);
    }

    // Add a small delay between items in a batch (if not the last item)
    if (i < itemIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.ITEM_DELAY));
    }
  }

  return localErrors;
}

// Main function to run all checks
async function main() {
  const args = process.argv.slice(2);
  const specificItemId = args.length > 0 ? parseInt(args[0]) : null;
  const errors: ErrorResult[] = [];
  const outputFilePath = path.resolve(CONFIG.OUTPUT_FILE);

  let itemsToCheck: number[];

  if (specificItemId !== null) {
    // Check a specific item ID
    if (isNaN(specificItemId) || !itemTypes[specificItemId]) {
      log.error(`Invalid item ID: ${args[0]}`);
      process.exit(1);
    }

    itemsToCheck = [specificItemId];
    log.info(
      `Checking specific item ID: ${specificItemId} (${itemTypes[specificItemId]?.name || 'Unknown'})`
    );
  } else {
    // Check all item IDs
    itemsToCheck = Object.keys(itemTypes)
      .map(key => parseInt(key))
      .filter(id => id > 0); // Skip item ID 0 (The Void)

    log.info(`Starting check for ${itemsToCheck.length} items...`);
  }

  // Process items in batches to avoid rate limiting
  if (specificItemId) {
    // If checking a specific item, don't batch
    await processBatch(itemsToCheck, errors, outputFilePath);
  } else {
    // Create batches of items
    const batches = [];
    for (let i = 0; i < itemsToCheck.length; i += CONFIG.BATCH_SIZE) {
      batches.push(itemsToCheck.slice(i, i + CONFIG.BATCH_SIZE));
    }

    log.info(`Processing ${batches.length} batches of up to ${CONFIG.BATCH_SIZE} items each`);

    let currentErrors = errors;
    for (let i = 0; i < batches.length; i++) {
      log.info(`Processing batch ${i + 1}/${batches.length}`);
      currentErrors = await processBatch(batches[i], currentErrors, outputFilePath);

      // Add a delay between batches (if not the last batch)
      if (i < batches.length - 1) {
        log.info(
          `Batch complete. Pausing for ${CONFIG.BATCH_DELAY / 1000} seconds before next batch...`
        );
        await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_DELAY));
      }
    }
  }

  if (errors.length > 0) {
    log.error(`Check completed with ${errors.length} errors found.`);
  } else {
    log.success(`Check completed. No errors found!`);
  }
  log.info(`Error report written to ${outputFilePath}`);
}

// Helper function to handle process termination
function setupProcessHandlers() {
  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    log.warning('\nProcess interrupted. Exiting gracefully...');
    process.exit(0);
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    log.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  });
}

// Initialize and run
setupProcessHandlers();
main().catch(error => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  log.error(`Error in main execution: ${errorMessage}`);
  process.exit(1);
});
