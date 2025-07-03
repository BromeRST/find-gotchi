// ABI for both single and batch functions
export const AAVEGOTCHI_ABI = [
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_tokenId',
        type: 'uint256',
      },
    ],
    name: 'getAavegotchi',
    outputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'tokenId',
            type: 'uint256',
          },
          {
            internalType: 'string',
            name: 'name',
            type: 'string',
          },
          {
            internalType: 'address',
            name: 'owner',
            type: 'address',
          },
          {
            internalType: 'uint256',
            name: 'randomNumber',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'status',
            type: 'uint256',
          },
          {
            internalType: 'int16[6]',
            name: 'numericTraits',
            type: 'int16[6]',
          },
          {
            internalType: 'int16[6]',
            name: 'modifiedNumericTraits',
            type: 'int16[6]',
          },
          {
            internalType: 'uint16[16]',
            name: 'equippedWearables',
            type: 'uint16[16]',
          },
          {
            internalType: 'address',
            name: 'collateral',
            type: 'address',
          },
          {
            internalType: 'address',
            name: 'escrow',
            type: 'address',
          },
          {
            internalType: 'uint256',
            name: 'stakedAmount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'minimumStake',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'kinship',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'lastInteracted',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'experience',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'toNextLevel',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'usedSkillPoints',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'level',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'hauntId',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'baseRarityScore',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'modifiedRarityScore',
            type: 'uint256',
          },
          {
            internalType: 'bool',
            name: 'locked',
            type: 'bool',
          },
          {
            components: [
              {
                internalType: 'uint256',
                name: 'balance',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'itemId',
                type: 'uint256',
              },
              {
                components: [
                  {
                    internalType: 'string',
                    name: 'name',
                    type: 'string',
                  },
                  {
                    internalType: 'string',
                    name: 'description',
                    type: 'string',
                  },
                  {
                    internalType: 'string',
                    name: 'author',
                    type: 'string',
                  },
                  {
                    internalType: 'int8[6]',
                    name: 'traitModifiers',
                    type: 'int8[6]',
                  },
                  {
                    internalType: 'bool[16]',
                    name: 'slotPositions',
                    type: 'bool[16]',
                  },
                  {
                    internalType: 'uint8[]',
                    name: 'allowedCollaterals',
                    type: 'uint8[]',
                  },
                  {
                    components: [
                      {
                        internalType: 'uint8',
                        name: 'x',
                        type: 'uint8',
                      },
                      {
                        internalType: 'uint8',
                        name: 'y',
                        type: 'uint8',
                      },
                      {
                        internalType: 'uint8',
                        name: 'width',
                        type: 'uint8',
                      },
                      {
                        internalType: 'uint8',
                        name: 'height',
                        type: 'uint8',
                      },
                    ],
                    internalType: 'struct Dimensions',
                    name: 'dimensions',
                    type: 'tuple',
                  },
                  {
                    internalType: 'uint256',
                    name: 'ghstPrice',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'maxQuantity',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'totalQuantity',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint32',
                    name: 'svgId',
                    type: 'uint32',
                  },
                  {
                    internalType: 'uint8',
                    name: 'rarityScoreModifier',
                    type: 'uint8',
                  },
                  {
                    internalType: 'bool',
                    name: 'canPurchaseWithGhst',
                    type: 'bool',
                  },
                  {
                    internalType: 'uint16',
                    name: 'minLevel',
                    type: 'uint16',
                  },
                  {
                    internalType: 'bool',
                    name: 'canBeTransferred',
                    type: 'bool',
                  },
                  {
                    internalType: 'uint8',
                    name: 'category',
                    type: 'uint8',
                  },
                  {
                    internalType: 'int16',
                    name: 'kinshipBonus',
                    type: 'int16',
                  },
                  {
                    internalType: 'uint32',
                    name: 'experienceBonus',
                    type: 'uint32',
                  },
                ],
                internalType: 'struct ItemType',
                name: 'itemType',
                type: 'tuple',
              },
            ],
            internalType: 'struct ItemTypeIO[]',
            name: 'items',
            type: 'tuple[]',
          },
        ],
        internalType: 'struct AavegotchiInfo',
        name: 'aavegotchiInfo_',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256[]',
        name: '_tokenIds',
        type: 'uint256[]',
      },
    ],
    name: 'batchGetBridgedAavegotchi',
    outputs: [
      {
        components: [
          {
            internalType: 'uint16[16]',
            name: 'equippedWearables',
            type: 'uint16[16]',
          },
          {
            internalType: 'int8[6]',
            name: 'temporaryTraitBoosts',
            type: 'int8[6]',
          },
          {
            internalType: 'int16[6]',
            name: 'numericTraits',
            type: 'int16[6]',
          },
          {
            internalType: 'string',
            name: 'name',
            type: 'string',
          },
          {
            internalType: 'uint256',
            name: 'randomNumber',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'experience',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'minimumStake',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'usedSkillPoints',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'interactionCount',
            type: 'uint256',
          },
          {
            internalType: 'address',
            name: 'collateralType',
            type: 'address',
          },
          {
            internalType: 'uint40',
            name: 'claimTime',
            type: 'uint40',
          },
          {
            internalType: 'uint40',
            name: 'lastTemporaryBoost',
            type: 'uint40',
          },
          {
            internalType: 'uint16',
            name: 'hauntId',
            type: 'uint16',
          },
          {
            internalType: 'address',
            name: 'owner',
            type: 'address',
          },
          {
            internalType: 'uint8',
            name: 'status',
            type: 'uint8',
          },
          {
            internalType: 'uint40',
            name: 'lastInteracted',
            type: 'uint40',
          },
          {
            internalType: 'bool',
            name: 'locked',
            type: 'bool',
          },
          {
            internalType: 'address',
            name: 'escrow',
            type: 'address',
          },
          {
            internalType: 'uint256[]',
            name: 'items',
            type: 'uint256[]',
          },
          {
            internalType: 'uint256',
            name: 'respecCount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'baseRandomNumber',
            type: 'uint256',
          },
        ],
        internalType: 'struct AavegotchiBridged[]',
        name: 'aavegotchiInfos_',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];
