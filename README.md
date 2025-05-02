# Aavegotchi Finder

A tool for finding and analyzing Aavegotchis and their wearables using The Graph protocol. This project provides utilities to:

- Find Aavegotchis with specific wearables
- Check wearable distribution and ownership
- Validate item balances across the Aavegotchi ecosystem

## Prerequisites

- Node.js (v20 or higher)
- Yarn package manager
- A Subgraph API key from Satsuma

## Setup

1. Clone the repository:

```bash
git clone https://github.com/BromeRST/find-gotchi.git
cd find-gotchi
```

2. Install dependencies:

```bash
yarn install
```

3. Create a `.env` file in the root directory and add your Subgraph API key:

```
SUBGRAPH_KEY=your_subgraph_key_here
RPC_URL=your_rpc_url_here (polygon)
```

The postinstall script will automatically generate the required GraphQL configuration using your API key.

## Available Commands

### Main Application

```bash
yarn start
```

Runs the main Aavegotchi finder application that checks for specific wearable items.

### Item Checker

```bash
yarn items-check
```

Runs a comprehensive check of all Aavegotchi items to validate their distribution and ownership. See [Item Checker Documentation](src/items-check/README-ItemCheck.md) for more details.

### Development Commands

```bash
yarn compile         # Compile the GraphQL schema
yarn format          # Format the codebase using Prettier
yarn generate-config # Generate the GraphClient configuration with your API key
```

## Project Structure

- `src/`: Main source code
  - `findGotchi.ts`: Core functionality for finding Aavegotchis with specific items
  - `items-check/`: Comprehensive item checking utilities
  - `queries/`: GraphQL queries for The Graph
- `lib/`: Utility and helper functions
- `.graphclient/`: Generated GraphQL client code

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
