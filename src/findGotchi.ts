import * as fs from 'fs';
import * as path from 'path';
import {
  findAavegotchisWithDressedItem,
  findBalanceReallyOwnedFromDiamond,
  findItemOwners,
} from './callQueries';
import { AAVEGOTCHI_DIAMOND } from '../lib/utils';
import { itemTypes } from '../lib/itemTypes';
import { log } from '../lib/logger';

const ITEM_ID_TO_CHECK = 12;

interface Gotchi {
  name: string;
  items: number[];
  equippedWearables?: number[];
}

interface GotchiResult {
  id: string;
  name: string;
  equippedWearables: number[];
}

interface GotchisData {
  [key: string]: Gotchi;
}

// Read the JSON file
const readGotchiData = (): GotchisData => {
  try {
    const filePath = path.resolve('./lib/aavegotchiMetadata.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading file:', error);
    process.exit(1);
  }
};

// Find gotchis with item in inventory but not equipped
const findGotchisWithItemNotEquipped = (gotchisObject: GotchisData) => {
  const results: { [key: string]: GotchiResult } = {};
  let count = 0;

  Object.entries(gotchisObject).forEach(([gotchiId, gotchi]) => {
    // Check if gotchi has item in inventory
    const hasItem = gotchi.items.includes(ITEM_ID_TO_CHECK);

    // Check if gotchi doesn't have item equipped
    const notEquippedItem = !gotchi.equippedWearables?.includes(ITEM_ID_TO_CHECK);

    // If both conditions are true, add this gotchi to results
    if (hasItem && notEquippedItem) {
      results[gotchiId] = {
        id: gotchiId,
        name: gotchi.name,
        equippedWearables: gotchi.equippedWearables || [],
      };
      count++;
    }
  });

  return { results, count };
};

// Main function
const main = async (): Promise<void> => {
  log.info(
    `Starting check for item ID: ${ITEM_ID_TO_CHECK} (${itemTypes[ITEM_ID_TO_CHECK]?.name || 'Unknown'})`
  );

  const ownersOfItem = await findItemOwners(ITEM_ID_TO_CHECK);
  const ownersTotalBalance = ownersOfItem.reduce((acc, { balance }) => acc + Number(balance), 0);

  const aavegotchiDiamondBalance =
    ownersOfItem.filter(({ owner }) => owner === AAVEGOTCHI_DIAMOND)[0]?.balance || 0;

  const itemType = itemTypes[ITEM_ID_TO_CHECK];
  log.info(`Aavegotchi Diamond balance: ${aavegotchiDiamondBalance}`);
  log.info(`Item max quantity: ${itemType.maxQuantity}`);

  // Check 0: Diamond balance should match item max quantity
  const check0Result = Number(ownersTotalBalance) === itemType.maxQuantity;
  log.check(
    'Check 0',
    check0Result,
    `Owners total balance (${ownersTotalBalance}) ${check0Result ? '===' : '!=='} item max quantity (${itemType.maxQuantity})`
  );

  if (!check0Result) return;

  // Check 1: aavegotchiDiamond balance === aavegotchis length
  const aavegotchisWithDressedItem = await findAavegotchisWithDressedItem(ITEM_ID_TO_CHECK);
  console.log('AAAVEGOTCHIS LENGTH =======>', aavegotchisWithDressedItem);
  const check1Result = Number(aavegotchiDiamondBalance) === aavegotchisWithDressedItem;
  log.check(
    'Check 1',
    check1Result,
    `Diamond balance (${aavegotchiDiamondBalance}) ${check1Result ? '===' : '!=='} aavegotchis with dressed item (${aavegotchisWithDressedItem})`
  );

  if (check1Result) return;

  // Get additional data needed for next checks
  const balanceReallyOwnedFromDiamond = await findBalanceReallyOwnedFromDiamond(ITEM_ID_TO_CHECK);
  log.info(`Balance really owned from Diamond: ${balanceReallyOwnedFromDiamond}`);

  // Check 2: aavegotchi diamond balance === aavegotchis length + balanceReallyOwnedFromDiamond
  const check2Sum = aavegotchisWithDressedItem + Number(balanceReallyOwnedFromDiamond);
  const check2Result = Number(aavegotchiDiamondBalance) === check2Sum;
  log.check(
    'Check 2',
    check2Result,
    `Diamond balance (${aavegotchiDiamondBalance}) ${check2Result ? '===' : '!=='} ` +
      `aavegotchis with dressed item (${aavegotchisWithDressedItem}) + balance really owned from Diamond (${balanceReallyOwnedFromDiamond})`
  );

  if (check2Result) return;

  // Get gotchis with item in pocket (not equipped)
  const gotchisData = readGotchiData();
  const { results, count } = findGotchisWithItemNotEquipped(gotchisData);

  log.info(`Found ${count} gotchis with item ${ITEM_ID_TO_CHECK} in inventory but not equipped`);

  if (count > 0) {
    log.info(`Gotchis with item in pocket but not equipped:`);
    const tableData = Object.entries(results).map(([id, data]) => ({
      id,
      name: data.name,
    }));
    log.table(tableData);
  }

  // Check 3: aavegotchiDiamondBalance === aavegotchis length + balanceReallyOwnedFromDiamond + aavegotchis with item in pocket
  const check3Sum = aavegotchisWithDressedItem + Number(balanceReallyOwnedFromDiamond) + count;
  const check3Result = Number(aavegotchiDiamondBalance) === check3Sum;
  log.check(
    'Check 3',
    check3Result,
    `Diamond balance (${aavegotchiDiamondBalance}) ${check3Result ? '===' : '!=='} ` +
      `aavegotchis with dressed item (${aavegotchisWithDressedItem}) + ` +
      `balance really owned from Diamond (${balanceReallyOwnedFromDiamond}) + ` +
      `gotchis with item in pocket (${count})`
  );

  if (check3Result) return;

  log.error(
    `All checks FAILED! Summary of checks:\n` +
      `- Check 1: ${aavegotchisWithDressedItem} (aavegotchis with dressed item)\n` +
      `- Check 2: ${check2Sum} (aavegotchis with dressed item + balance really owned from Diamond)\n` +
      `- Check 3: ${check3Sum} (aavegotchis with dressed item + balance really owned from Diamond + gotchis with item in pocket)`
  );
};

main();
