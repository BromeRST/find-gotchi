export const gotchiQuery = `
  gotchisOriginalOwned(first: 2000) {
    id
  }
`;

export const portalQuery = `
  portalsOwned(first: 2000, where: { claimedAt: null }) {
    id
  }
`;

export const fakegotchiQuery = `
  fakeGotchiNFTTokens(first: 2000) {
    identifier
  }
`;

export const parcelQuery = `
  parcelsOwned(first: 2000) {
    id
  }
`;

export function buildUsersQuery(selection: string): string {
  return `
  query GetUsers($first: Int!, $skip: Int!, $block: Block_height) {
    users(first: $first, skip: $skip, block: $block) {
      id
      ${selection}
    }
  }
`;
}

export const GOTCHI_LENDINGS_QUERY = `
  query GetGotchiLendings($first: Int!, $skip: Int!, $block: Block_height) {
    gotchiLendings(
      first: $first,
      skip: $skip,
      block: $block,
      where: {
        cancelled: false
        completed: false
      }
    ) {
      id
      gotchiTokenId
      lender
      gotchi {
        owner {
          id
        }
        originalOwner {
          id
        }
      }
    }
  }
`;

export const ETHEREUM_AAVEGOTCHIS_QUERY = `
  query GetEthereumAavegotchis($first: Int!, $skip: Int!) {
    aavegotchis(
      first: $first,
      skip: $skip,
      orderBy: owner__id
    ) {
      id
      owner {
        id
      }
    }
  }
`;
