import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const SUBGRAPH_KEY = process.env.SUBGRAPH_KEY;

if (!SUBGRAPH_KEY) {
  console.error('ERROR: SUBGRAPH_KEY environment variable is not set');
  process.exit(1);
}

const configContent = `sources:
  - name: aavegotchi-core-matic
    handler:
      graphql:
        endpoint: >-
          https://subgraph.satsuma-prod.com/${SUBGRAPH_KEY}/aavegotchi/aavegotchi-core-matic/version/matic-add-owners-to-wearables-6/api

documents:
  - ./src/queries/*.graphql

codegen:
  scalars:
    BigInt: string
    Bytes: string
    BigDecimal: string
`;

// Write the config file
fs.writeFileSync(path.resolve('.graphclientrc'), configContent);

console.log('Successfully generated .graphclientrc with SUBGRAPH_KEY');
