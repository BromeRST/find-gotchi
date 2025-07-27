// Types for the comparison
export interface AavegotchiInfo {
  tokenId: bigint;
  name: string;
  owner: string;
  randomNumber: bigint;
  status: bigint;
  numericTraits: bigint[];
  modifiedNumericTraits: bigint[];
  equippedWearables: bigint[];
  collateral: string;
  escrow: string;
  stakedAmount: bigint;
  minimumStake: bigint;
  kinship: bigint;
  lastInteracted: bigint;
  experience: bigint;
  toNextLevel: bigint;
  usedSkillPoints: bigint;
  level: bigint;
  hauntId: bigint;
  baseRarityScore: bigint;
  modifiedRarityScore: bigint;
  locked: boolean;
  items: any[];
}

export interface AavegotchiBridged {
  equippedWearables: bigint[];
  temporaryTraitBoosts: bigint[];
  numericTraits: bigint[];
  name: string;
  randomNumber: bigint;
  experience: bigint;
  minimumStake: bigint;
  usedSkillPoints: bigint;
  interactionCount: bigint;
  collateralType: string;
  claimTime: bigint;
  lastTemporaryBoost: bigint;
  hauntId: bigint;
  owner: string;
  status: bigint;
  lastInteracted: bigint;
  locked: boolean;
  escrow: string;
  items: bigint[];
  respecCount: bigint;
  baseRandomNumber: bigint;
}

export interface AavegotchiDiscrepancy {
  field: string;
  polygonValue: any;
  baseValue: any;
  discrepancyType: 'value_mismatch' | 'missing_polygon' | 'missing_base';
}

export interface ComparisonResult {
  timestamp: string;
  tokenId: string;
  polygonData: AavegotchiInfo | null;
  baseData: AavegotchiInfo | null;
  isIdentical: boolean;
  discrepancies: AavegotchiDiscrepancy[];
  error?: string;
}

export interface BatchResult {
  timestamp: string;
  batchNumber: number;
  startId: number;
  endId: number;
  results: ComparisonResult[];
  summary: {
    total: number;
    identical: number;
    different: number;
    errors: number;
    missingPolygon: number;
    missingBase: number;
  };
}

export interface FinalSummary {
  timestamp: string;
  totalProcessed: number;
  totalBatches: number;
  overallSummary: {
    identical: number;
    different: number;
    errors: number;
    missingPolygon: number;
    missingBase: number;
  };
  processingTime: string;
  polygonBlockNumber: number;
  filteredOwnerDiscrepancies: number;
  fieldDiscrepancies: Record<string, number>;
  allResults: ComparisonResult[];
  batchSummaries: {
    batchNumber: number;
    startId: number;
    endId: number;
    summary: {
      total: number;
      identical: number;
      different: number;
      errors: number;
      missingPolygon: number;
      missingBase: number;
    };
  }[];
}
