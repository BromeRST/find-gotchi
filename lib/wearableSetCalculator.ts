import { setsList } from './setsList';

interface WearableSet {
  name: string;
  allowedCollaterals: number[];
  wearableIds: number[];
  traitsBonuses: number[]; // [brsBonus, energy, aggression, spookiness, brain]
}

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

// Calculate base rarity score from numeric traits (equivalent to subgraph function)
function calculateBaseRarityScore(numericTraits: number[]): number {
  let rarityScore = 0;

  for (const trait of numericTraits) {
    if (trait < 50) {
      rarityScore = rarityScore + (100 - trait);
    } else {
      rarityScore = rarityScore + (trait + 1);
    }
  }

  return rarityScore;
}

// Find sets that match the equipped wearables
function findMatchingSets(equippedWearableIds: number[]): number[] {
  const matchingSets: number[] = [];

  for (const set of setsList) {
    // Check if all wearables in the set are equipped and set has a valid setId
    if (typeof set.setId === 'number') {
      const setWearableIds = set.wearableIds;
      const isComplete = setWearableIds.every(wearableId =>
        equippedWearableIds.includes(wearableId)
      );

      if (isComplete) {
        matchingSets.push(set.setId);
      }
    }
  }

  return matchingSets;
}

export function updateAavegotchiWearableSets(gotchi: AavegotchiMetadata): AavegotchiMetadata {
  // Convert equipped wearables from strings to numbers, filtering out zeros
  const equippedWearableIds = gotchi.equippedWearables.map(id => parseInt(id)).filter(id => id > 0);

  if (equippedWearableIds.length === 0) {
    // No wearables equipped, reset set fields
    gotchi.equippedSetID = null;
    gotchi.equippedSetName = null;
    gotchi.withSetsRarityScore = gotchi.modifiedRarityScore;
    gotchi.withSetsNumericTraits = [...gotchi.modifiedNumericTraits];
    return gotchi;
  }

  console.log(`Finding wearable sets for equipped wearables: [${equippedWearableIds.join(', ')}]`);

  // Find matching sets using local data
  const foundSetIDs = findMatchingSets(equippedWearableIds);

  if (foundSetIDs.length === 0) {
    // No sets found
    gotchi.equippedSetID = null;
    gotchi.equippedSetName = null;
    gotchi.withSetsRarityScore = gotchi.modifiedRarityScore;
    gotchi.withSetsNumericTraits = [...gotchi.modifiedNumericTraits];
    return gotchi;
  }

  console.log(`Found ${foundSetIDs.length} possible sets: [${foundSetIDs.join(', ')}]`);

  // Find the best set (longest wearable count)
  let bestSetID = 0;
  let longestSetLength = 0;

  for (const setId of foundSetIDs) {
    const setData = setsList.find(s => s.setId === setId);
    if (setData) {
      const setLength = setData.wearableIds.length;

      if (setLength >= longestSetLength) {
        longestSetLength = setLength;
        bestSetID = setId;
      }
    }
  }

  const bestSet = setsList.find(s => s.setId === bestSetID);
  if (!bestSet) {
    // Fallback: no set bonuses
    gotchi.equippedSetID = null;
    gotchi.equippedSetName = null;
    gotchi.withSetsRarityScore = gotchi.modifiedRarityScore;
    gotchi.withSetsNumericTraits = [...gotchi.modifiedNumericTraits];
    return gotchi;
  }

  console.log(`Best set: ${bestSet.name} (ID: ${bestSetID}, Length: ${longestSetLength})`);

  // Calculate set bonuses
  const setBonuses = bestSet.traitsBonuses;
  const brsBonus = setBonuses[0];

  // Convert modifiedNumericTraits to numbers for calculation
  const modifiedTraits = gotchi.modifiedNumericTraits.map(trait => parseInt(trait));

  // Calculate before set bonus
  const beforeSetBonus = calculateBaseRarityScore(modifiedTraits);

  // Apply set bonuses to traits (skip BRS bonus at index 0, apply trait bonuses)
  const withSetsTraits = [...modifiedTraits];
  for (let i = 0; i < 4; i++) {
    withSetsTraits[i] = withSetsTraits[i] + setBonuses[i + 1];
  }

  // Calculate after set bonus
  const afterSetBonus = calculateBaseRarityScore(withSetsTraits);

  // Get the difference
  const bonusDifference = afterSetBonus - beforeSetBonus;

  // Update the gotchi with set information
  gotchi.withSetsNumericTraits = withSetsTraits.map(trait => trait.toString());

  // Add bonus differences to the modified rarity score
  const modifiedRarityScore = parseInt(gotchi.modifiedRarityScore);
  gotchi.withSetsRarityScore = (modifiedRarityScore + bonusDifference + brsBonus).toString();

  // Set the equipped set ID and name
  gotchi.equippedSetID = bestSetID.toString();
  gotchi.equippedSetName = bestSet.name;

  console.log(
    `Updated set info - ID: ${bestSetID}, Name: ${bestSet.name}, BRS Bonus: ${brsBonus}, Trait Bonus Difference: ${bonusDifference}`
  );

  return gotchi;
}

export { calculateBaseRarityScore };
