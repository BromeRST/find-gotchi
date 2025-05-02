export interface Owner {
  owner: string;
  balance: string;
}

export interface AavegotchiFacet {
  batchGetBridgedAavegotchi: (tokenIds: number[]) => Promise<any[]>;
}

export interface ErrorResult {
  itemId: number;
  itemName: string;
  maxQuantity: number;
  errorType: 'check0' | 'check1' | 'check2' | 'check3';
  errorData: {
    ownersTotal?: number;
    aavegotchiDiamondBalance?: number;
    aavegotchisWithDressedItem?: number;
    balanceReallyOwned?: number;
    gotchisWithItemNotEquipped?: number;
    discrepancy?: number;
  };
  message: string;
}

export interface Gotchi {
  name: string;
  items: number[];
  equippedWearables?: number[];
}

export interface GotchisData {
  [key: string]: Gotchi;
}
