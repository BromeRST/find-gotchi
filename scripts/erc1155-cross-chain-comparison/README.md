# ERC1155 Cross-Chain Comparison

A comprehensive tool for comparing ERC1155 token ownership data across multiple chains. This tool helps identify discrepancies in token balances between Polygon and Base networks (including Base Sepolia).

## 🌟 Features

- **Multi-Chain Support**: Compare data between Polygon and Base/Base Sepolia networks
- **Network Selection**: Choose between Base mainnet or Base Sepolia for comparisons
- **Batch Processing**: Run comparisons for multiple ERC1155 collections
- **Detailed Reporting**: Generate comprehensive JSON reports with discrepancy analysis
- **Rate Limiting**: Built-in delays to respect API rate limits
- **Block Number Support**: Compare data at specific block heights

## 🚀 Quick Start

### Prerequisites

1. **Alchemy API Key**: Get your API key from [Alchemy](https://www.alchemy.com/)
2. **Environment Setup**: Copy `config.example.env` to your project's `.env` file

```bash
# Copy the example config
cp scripts/erc1155-cross-chain-comparison/config.example.env .env

# Edit .env and add your Alchemy API key
ALCHEMY_API_KEY=your_alchemy_api_key_here
```

### Running Comparisons

#### 1. Run All Collections (Base Mainnet)

```bash
# Default: Compare Polygon with Base mainnet
cd scripts/erc1155-cross-chain-comparison
npx ts-node runAllCollections.ts

# Explicitly specify Base mainnet
npx ts-node runAllCollections.ts --network=base
# or
npx ts-node runAllCollections.ts --base
```

#### 2. Run All Collections (Base Sepolia)

```bash
# Compare Polygon with Base Sepolia
npx ts-node runAllCollections.ts --network=basesepolia
# or
npx ts-node runAllCollections.ts --basesepolia
```

#### 3. Single Collection Comparison

```bash
# Default: Base mainnet
npx ts-node compareOwnersAcrossChains.ts

# With Base Sepolia
npx ts-node compareOwnersAcrossChains.ts --network=basesepolia
```

## 📋 Supported Collections

The tool currently supports the following ERC1155 collections:

| Collection        | Polygon | Base | Base Sepolia |
| ----------------- | ------- | ---- | ------------ |
| **FakeCards**     | ✅      | ✅   | ✅           |
| **Forge**         | ✅      | ✅   | ✅           |
| **Installations** | ✅      | ❌   | ✅           |
| **Tiles**         | ✅      | ❌   | ✅           |

> **Note**: Some collections may not be available on Base mainnet but are available on Base Sepolia for testing.

## ⚙️ Configuration

### Network Selection

The tool supports three ways to specify the network:

1. **Command Line Arguments**:

   - `--network=base` or `--network=basesepolia`
   - `--base` or `--basesepolia`

2. **Environment Variables**:

   - Set `NETWORK=base` or `NETWORK=basesepolia`

3. **Default**: Base mainnet if no network is specified

### Block Numbers

You can specify block numbers for each network in the collection definitions:

```typescript
{
  name: 'FakeCards',
  blockNumber: {
    polygon: '74262598',
    base: '12345678',
    basesepolia: '9876543',
  },
}
```

### Adding New Collections

To add a new collection, update the `COLLECTIONS` array in `runAllCollections.ts`:

```typescript
{
  name: 'YourCollection',
  baseAddress: baseAddresses.yourContract,
  baseSepoliaAddress: baseSepoliaAddresses.yourContract,
  polygonAddress: polygonAddresses.yourContract,
  blockNumber: {
    polygon: 'latest', // or specific block number
    // base: '12345678', // optional
    // basesepolia: '9876543', // optional
  },
}
```

## 📊 Output & Results

### Console Output

The tool provides real-time progress updates:

- 🚀 Collection processing status
- 📍 Contract addresses and block numbers
- 🔗 Chain comparison progress
- ✅ Success/failure status
- 📊 Summary statistics

### JSON Reports

Detailed results are saved to `data/results/erc1155/`:

```json
{
  "collectionName": "FakeCards",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "summary": {
    "totalOwners": {
      "Polygon": 150,
      "Base": 145
    },
    "uniqueOwners": 155,
    "ownersWithDiscrepancies": 3,
    "tokenDiscrepancies": 7,
    "chainsCompared": ["Polygon", "Base"],
    "contractAddresses": {
      "Polygon": "0x...",
      "Base": "0x..."
    }
  },
  "discrepancies": [...],
  "detailedReport": {...}
}
```

## 🔧 Development

### Project Structure

```
scripts/erc1155-cross-chain-comparison/
├── compareOwnersAcrossChains.ts  # Single collection comparison
├── runAllCollections.ts          # Multi-collection batch processing
├── config.example.env            # Environment configuration template
├── lib/
│   ├── chainAddresses.ts         # Contract addresses for all networks
│   ├── comparison.ts             # Data comparison logic
│   ├── fetchers.ts              # API data fetching
│   ├── printers.ts              # Console output formatting
│   ├── types.ts                 # TypeScript type definitions
│   └── utils.ts                 # Utility functions
└── README.md                     # This file
```

### Adding Support for New Networks

1. **Add Network Addresses**: Update `lib/chainAddresses.ts`
2. **Update Types**: Modify network type definitions
3. **Update Scripts**: Add network support to main scripts
4. **Update Configuration**: Extend `getCollectionConfig()` function

## 🐛 Troubleshooting

### Common Issues

1. **Missing API Key**

   ```
   ❌ ALCHEMY_API_KEY is required
   ```

   **Solution**: Set your Alchemy API key in the `.env` file

2. **Network Not Found**

   ```
   ❌ Invalid network: xyz. Must be 'base' or 'basesepolia'
   ```

   **Solution**: Use valid network names: `base` or `basesepolia`

3. **Contract Not Deployed**

   ```
   Error fetching data: Contract not deployed on network
   ```

   **Solution**: Check if the collection is available on the selected network

4. **Rate Limiting**
   ```
   Rate limit exceeded
   ```
   **Solution**: The tool includes automatic delays. If issues persist, increase delay in configuration

### Debug Mode

For detailed debugging, you can modify the request delay and logging in the configuration files.

## 📈 Performance

- **Processing Time**: ~30-60 seconds per collection
- **Rate Limits**: Built-in 5-second delays between collections
- **Memory Usage**: Optimized for large datasets
- **Concurrent Requests**: Limited to prevent API throttling

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add your changes
4. Test with both networks
5. Submit a pull request

## 📄 License

This project is part of the Aavegotchi ecosystem tools.
