import fs from 'fs/promises';
import path from 'path';
import { ethers } from 'ethers';

// Types for the comparison results
interface SvgResult {
  front: string;
  back: string;
  left: string;
  right: string;
}

interface StringDifference {
  position: number;
  expected: string;
  actual: string;
  context: string;
}

interface ViewDifference {
  view: string;
  differences: StringDifference[];
  expectedLength: number;
  actualLength: number;
}

interface ItemComparison {
  itemId: number;
  itemName?: string;
  polygonSvgs: SvgResult | null;
  baseSepoliaSvgs: SvgResult | null;
  isIdentical: boolean;
  differences: string[];
  error?: string;
  detailedDifferences?: ViewDifference[];
}

interface ComparisonReport {
  timestamp: string;
  totalItemsCompared: number;
  identicalCount: number;
  differentCount: number;
  errorCount: number;
  polygonRpcUrl: string;
  baseSepoliaRpcUrl: string;
  polygonContractAddress: string;
  baseSepoliaContractAddress: string;
  itemComparisons: ItemComparison[];
  // Summary of discrepancies for easy analysis
  discrepancySummary: {
    itemsWithFrontDifferences: number[];
    itemsWithBackDifferences: number[];
    itemsWithLeftDifferences: number[];
    itemsWithRightDifferences: number[];
    itemsWithMultipleDifferences: number[];
    itemsWithErrors: number[];
  };
}

// Configuration - You'll need to fill these in
const CONFIG = {
  POLYGON_RPC_URL: 'https://polygon-rpc.com',
  BASE_SEPOLIA_RPC_URL: 'https://sepolia.base.org',
  POLYGON_CONTRACT_ADDRESS: '0x86935F11C86623deC8a25696E1C19a8659CbF95d',
  BASE_SEPOLIA_CONTRACT_ADDRESS: '0x10759c35F8dE7E6172BB30e0B10312c1a295aC2F',
  BATCH_SIZE: 5, // Reduced batch size to avoid overwhelming RPC endpoints
  MAX_ITEMS: 417, // Total items to compare (as per Aavegotchi wearables)
  BATCH_DELAY_MS: 2000, // Delay between batches in milliseconds (2 seconds)
  REQUEST_DELAY_MS: 100, // Small delay between individual requests within a batch
};

// ABI for the getItemSvgs function (you'll need to adjust this based on your actual contract)
const CONTRACT_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'itemId', type: 'uint256' }],
    name: 'getItemSvgs',
    outputs: [{ internalType: 'string[]', name: '', type: 'string[]' }],
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * Mock getItemSvgs function - Replace this with actual contract call
 * This is a placeholder implementation until you provide the actual function
 */
async function getItemSvgs(contract: ethers.Contract, itemId: number): Promise<SvgResult> {
  try {
    const svgs = await contract.getItemSvgs(itemId);

    // Assuming the contract returns an array with [front, back, left, right]
    // Adjust the array indices based on your actual contract implementation
    return {
      front: svgs[0] || '',
      back: svgs[1] || '',
      left: svgs[2] || '',
      right: svgs[3] || '',
    };
  } catch (error) {
    throw new Error(
      `Failed to get SVGs for item ${itemId}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Comprehensive SVG normalization for accurate comparison
 */
function normalizeSvg(svg: string): string {
  return (
    svg
      // Normalize line endings and remove all unnecessary whitespace
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      // Remove whitespace around tags
      .replace(/>\s+</g, '><')
      .replace(/\s+>/g, '>')
      .replace(/<\s+/g, '<')
      // Remove whitespace at start/end of attributes
      .replace(/=\s+"/g, '="')
      .replace(/"\s+/g, '" ')
      // Normalize attribute spacing and quotes
      .replace(/\s*=\s*/g, '=')
      .replace(/'/g, '"')
      // Remove trailing semicolons and extra spaces in style/path attributes
      .replace(/;\s*"/g, '"')
      .replace(/,\s+/g, ',')
      // Remove comments and processing instructions
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\?[\s\S]*?\?>/g, '')
      // Trim and normalize case
      .trim()
      .toLowerCase()
  );
}

/**
 * Find detailed character-by-character differences between two strings
 */
function findStringDifferences(expected: string, actual: string, view: string): ViewDifference {
  const differences: StringDifference[] = [];
  const maxLength = Math.max(expected.length, actual.length);

  for (let i = 0; i < maxLength; i++) {
    const expectedChar = expected[i] || '';
    const actualChar = actual[i] || '';

    if (expectedChar !== actualChar) {
      // Get context around the difference (10 chars before and after)
      const contextStart = Math.max(0, i - 10);
      const contextEnd = Math.min(expected.length, i + 11);
      const context = expected
        .slice(contextStart, contextEnd)
        .replace(expectedChar, `[${expectedChar}]`)
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t');

      differences.push({
        position: i,
        expected: expectedChar.replace(/\n/g, '\\n').replace(/\t/g, '\\t'),
        actual: actualChar.replace(/\n/g, '\\n').replace(/\t/g, '\\t'),
        context: context,
      });

      // Limit to first 10 differences to avoid overwhelming output
      if (differences.length >= 10) break;
    }
  }

  return {
    view,
    differences,
    expectedLength: expected.length,
    actualLength: actual.length,
  };
}

/**
 * Compare SVG results between two SvgResult objects with detailed difference tracking
 */
function compareSvgResults(
  polygon: SvgResult,
  baseSepolia: SvgResult
): {
  isIdentical: boolean;
  differences: string[];
  detailedDifferences: ViewDifference[];
} {
  const differences: string[] = [];
  const detailedDifferences: ViewDifference[] = [];

  // Normalize SVGs before comparison
  const polygonNormalized = {
    front: normalizeSvg(polygon.front),
    back: normalizeSvg(polygon.back),
    left: normalizeSvg(polygon.left),
    right: normalizeSvg(polygon.right),
  };

  const baseSepoliaNormalized = {
    front: normalizeSvg(baseSepolia.front),
    back: normalizeSvg(baseSepolia.back),
    left: normalizeSvg(baseSepolia.left),
    right: normalizeSvg(baseSepolia.right),
  };

  // Compare each view and collect detailed differences
  const views = ['front', 'back', 'left', 'right'] as const;

  for (const view of views) {
    if (polygonNormalized[view] !== baseSepoliaNormalized[view]) {
      differences.push(view);

      // Get detailed character differences
      const viewDiff = findStringDifferences(
        polygonNormalized[view],
        baseSepoliaNormalized[view],
        view
      );
      detailedDifferences.push(viewDiff);
    }
  }

  return {
    isIdentical: differences.length === 0,
    differences,
    detailedDifferences,
  };
}

/**
 * Get item name from itemTypes (optional, for better reporting)
 */
function getItemName(itemId: number): string | undefined {
  try {
    // Import itemTypes if available
    const { itemTypes } = require('../../lib/itemTypes');
    return itemTypes[itemId]?.name;
  } catch {
    // If itemTypes is not available or item not found, return undefined
    return undefined;
  }
}

/**
 * Compare SVGs for a single item between two chains
 */
async function compareItemSvgs(
  polygonContract: ethers.Contract,
  baseSepoliaContract: ethers.Contract,
  itemId: number
): Promise<ItemComparison> {
  const comparison: ItemComparison = {
    itemId,
    itemName: getItemName(itemId),
    polygonSvgs: null,
    baseSepoliaSvgs: null,
    isIdentical: false,
    differences: [],
  };

  try {
    // Get SVGs from both chains
    const [polygonSvgs, baseSepoliaSvgs] = await Promise.allSettled([
      getItemSvgs(polygonContract, itemId),
      getItemSvgs(baseSepoliaContract, itemId),
    ]);

    // Handle Polygon results
    if (polygonSvgs.status === 'fulfilled') {
      comparison.polygonSvgs = polygonSvgs.value;
    } else {
      comparison.error = `Polygon error: ${polygonSvgs.reason}`;
    }

    // Handle Base Sepolia results
    if (baseSepoliaSvgs.status === 'fulfilled') {
      comparison.baseSepoliaSvgs = baseSepoliaSvgs.value;
    } else {
      comparison.error = comparison.error
        ? `${comparison.error}; Base Sepolia error: ${baseSepoliaSvgs.reason}`
        : `Base Sepolia error: ${baseSepoliaSvgs.reason}`;
    }

    // Compare if both succeeded
    if (comparison.polygonSvgs && comparison.baseSepoliaSvgs) {
      const comparisonResult = compareSvgResults(
        comparison.polygonSvgs,
        comparison.baseSepoliaSvgs
      );
      comparison.isIdentical = comparisonResult.isIdentical;
      comparison.differences = comparisonResult.differences;
      comparison.detailedDifferences = comparisonResult.detailedDifferences;

      // Log detailed differences for troubleshooting
      if (!comparison.isIdentical && comparisonResult.detailedDifferences.length > 0) {
        console.log(
          `🔍 Item ${itemId}: Found differences in [${comparison.differences.join(', ')}]`
        );
        comparisonResult.detailedDifferences.forEach(viewDiff => {
          if (viewDiff.differences.length > 0) {
            console.log(`  📍 ${viewDiff.view}: ${viewDiff.differences.length} char diffs`);
            // Show first difference for debugging
            const firstDiff = viewDiff.differences[0];
            console.log(
              `     First diff at pos ${firstDiff.position}: '${firstDiff.expected}' vs '${firstDiff.actual}'`
            );
          }
        });
      }
    }
  } catch (error) {
    comparison.error = `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }

  return comparison;
}

/**
 * Process items in batches to avoid overwhelming the RPC endpoints
 */
async function processBatch(
  polygonContract: ethers.Contract,
  baseSepoliaContract: ethers.Contract,
  itemIds: number[]
): Promise<ItemComparison[]> {
  const results: ItemComparison[] = [];

  // Process items sequentially within batch to add small delays
  for (const itemId of itemIds) {
    try {
      const result = await compareItemSvgs(polygonContract, baseSepoliaContract, itemId);
      results.push(result);

      // Small delay between individual requests within batch
      if (CONFIG.REQUEST_DELAY_MS > 0) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.REQUEST_DELAY_MS));
      }
    } catch (error) {
      console.error(`❌ Error processing item ${itemId}:`, error);
      results.push({
        itemId,
        itemName: getItemName(itemId),
        polygonSvgs: null,
        baseSepoliaSvgs: null,
        isIdentical: false,
        differences: [],
        error: `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  return results;
}

/**
 * Main function to compare SVGs between chains
 */
async function main() {
  console.log('🚀 Starting SVG comparison between Polygon and Base Sepolia...');

  // Validate configuration
  if (!CONFIG.POLYGON_RPC_URL || !CONFIG.BASE_SEPOLIA_RPC_URL) {
    throw new Error(
      'Please set POLYGON_RPC_URL and BASE_SEPOLIA_RPC_URL in your environment variables'
    );
  }

  if (!CONFIG.POLYGON_CONTRACT_ADDRESS || !CONFIG.BASE_SEPOLIA_CONTRACT_ADDRESS) {
    throw new Error(
      'Please set POLYGON_CONTRACT_ADDRESS and BASE_SEPOLIA_CONTRACT_ADDRESS in your environment variables'
    );
  }

  // Create providers
  const polygonProvider = new ethers.JsonRpcProvider(CONFIG.POLYGON_RPC_URL);
  const baseSepoliaProvider = new ethers.JsonRpcProvider(CONFIG.BASE_SEPOLIA_RPC_URL);

  // Create contract instances
  const polygonContract = new ethers.Contract(
    CONFIG.POLYGON_CONTRACT_ADDRESS,
    CONTRACT_ABI,
    polygonProvider
  );
  const baseSepoliaContract = new ethers.Contract(
    CONFIG.BASE_SEPOLIA_CONTRACT_ADDRESS,
    CONTRACT_ABI,
    baseSepoliaProvider
  );

  // Generate list of item IDs to compare (adjust this based on your needs)
  const itemIds = Array.from({ length: CONFIG.MAX_ITEMS }, (_, i) => i + 1);

  const allComparisons: ItemComparison[] = [];
  let processedCount = 0;

  // Process items in batches
  for (let i = 0; i < itemIds.length; i += CONFIG.BATCH_SIZE) {
    const batch = itemIds.slice(i, i + CONFIG.BATCH_SIZE);
    console.log(
      `📊 Processing batch ${Math.floor(i / CONFIG.BATCH_SIZE) + 1} (items ${i + 1}-${Math.min(i + CONFIG.BATCH_SIZE, itemIds.length)})`
    );

    try {
      const batchResults = await processBatch(polygonContract, baseSepoliaContract, batch);
      allComparisons.push(...batchResults);
      processedCount += batch.length;

      console.log(`✅ Completed ${processedCount}/${itemIds.length} items`);

      // Add delay between batches to be respectful to RPC endpoints
      if (i + CONFIG.BATCH_SIZE < itemIds.length) {
        console.log(`⏳ Waiting ${CONFIG.BATCH_DELAY_MS}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_DELAY_MS));
      }
    } catch (error) {
      console.error(`❌ Error processing batch starting at item ${i + 1}:`, error);
    }
  }

  // Generate discrepancy summary for easier analysis
  const itemsWithFrontDifferences: number[] = [];
  const itemsWithBackDifferences: number[] = [];
  const itemsWithLeftDifferences: number[] = [];
  const itemsWithRightDifferences: number[] = [];
  const itemsWithMultipleDifferences: number[] = [];
  const itemsWithErrors: number[] = [];

  allComparisons.forEach(comparison => {
    if (comparison.error) {
      itemsWithErrors.push(comparison.itemId);
      return;
    }

    if (comparison.differences.length > 0) {
      if (comparison.differences.includes('front')) {
        itemsWithFrontDifferences.push(comparison.itemId);
      }
      if (comparison.differences.includes('back')) {
        itemsWithBackDifferences.push(comparison.itemId);
      }
      if (comparison.differences.includes('left')) {
        itemsWithLeftDifferences.push(comparison.itemId);
      }
      if (comparison.differences.includes('right')) {
        itemsWithRightDifferences.push(comparison.itemId);
      }
      if (comparison.differences.length > 1) {
        itemsWithMultipleDifferences.push(comparison.itemId);
      }
    }
  });

  // Filter to only include items with differences or errors (exclude identical items)
  const itemsWithIssues = allComparisons.filter(c => !c.isIdentical || c.error);

  // Generate report
  const report: ComparisonReport = {
    timestamp: new Date().toISOString(),
    totalItemsCompared: allComparisons.length,
    identicalCount: allComparisons.filter(c => c.isIdentical).length,
    differentCount: allComparisons.filter(c => !c.isIdentical && !c.error).length,
    errorCount: allComparisons.filter(c => c.error).length,
    polygonRpcUrl: CONFIG.POLYGON_RPC_URL,
    baseSepoliaRpcUrl: CONFIG.BASE_SEPOLIA_RPC_URL,
    polygonContractAddress: CONFIG.POLYGON_CONTRACT_ADDRESS,
    baseSepoliaContractAddress: CONFIG.BASE_SEPOLIA_CONTRACT_ADDRESS,
    itemComparisons: itemsWithIssues, // Only store items with differences or errors
    discrepancySummary: {
      itemsWithFrontDifferences,
      itemsWithBackDifferences,
      itemsWithLeftDifferences,
      itemsWithRightDifferences,
      itemsWithMultipleDifferences,
      itemsWithErrors,
    },
  };

  // Save results
  const outputPath = path.join(process.cwd(), 'data/results', `svg-comparison-${Date.now()}.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log('\n📈 Comparison Summary:');
  console.log(`Total items compared: ${report.totalItemsCompared}`);
  console.log(`Identical: ${report.identicalCount}`);
  console.log(`Different: ${report.differentCount}`);
  console.log(`Errors: ${report.errorCount}`);
  console.log(`\n💾 Results saved to: ${outputPath}`);
  console.log(
    `📁 File contains ${itemsWithIssues.length} items (only differences and errors, ${report.identicalCount} identical items excluded)`
  );

  // Print discrepancy breakdown
  console.log('\n🔍 Discrepancy Breakdown:');
  console.log(
    `Items with front differences: ${report.discrepancySummary.itemsWithFrontDifferences.length}`
  );
  console.log(
    `Items with back differences: ${report.discrepancySummary.itemsWithBackDifferences.length}`
  );
  console.log(
    `Items with left differences: ${report.discrepancySummary.itemsWithLeftDifferences.length}`
  );
  console.log(
    `Items with right differences: ${report.discrepancySummary.itemsWithRightDifferences.length}`
  );
  console.log(
    `Items with multiple differences: ${report.discrepancySummary.itemsWithMultipleDifferences.length}`
  );

  // Show some examples of differences with detailed analysis
  const differentItems = allComparisons.filter(c => !c.isIdentical && !c.error).slice(0, 5);
  if (differentItems.length > 0) {
    console.log('\n🔍 Sample differences:');
    differentItems.forEach(item => {
      console.log(
        `  Item ${item.itemId}${item.itemName ? ` (${item.itemName})` : ''}: ${item.differences.join(', ')} differ`
      );

      // Show detailed differences for first item as example
      if (item.detailedDifferences && item.detailedDifferences.length > 0) {
        item.detailedDifferences.slice(0, 2).forEach(viewDiff => {
          console.log(
            `    📍 ${viewDiff.view} view: ${viewDiff.differences.length} character differences`
          );
          if (viewDiff.expectedLength !== viewDiff.actualLength) {
            console.log(
              `       Length: Polygon=${viewDiff.expectedLength}, Base Sepolia=${viewDiff.actualLength}`
            );
          }

          // Show first few character differences
          viewDiff.differences.slice(0, 3).forEach(diff => {
            console.log(
              `       Pos ${diff.position}: Expected='${diff.expected}' Got='${diff.actual}'`
            );
            console.log(`       Context: ...${diff.context}...`);
          });

          if (viewDiff.differences.length > 3) {
            console.log(`       ... and ${viewDiff.differences.length - 3} more differences`);
          }
        });
      }
    });
  }

  // Show item IDs with specific differences (first 10 of each type)
  if (report.discrepancySummary.itemsWithFrontDifferences.length > 0) {
    console.log(
      `\n🎭 Items with front differences: [${report.discrepancySummary.itemsWithFrontDifferences.slice(0, 10).join(', ')}]${report.discrepancySummary.itemsWithFrontDifferences.length > 10 ? '...' : ''}`
    );
  }
  if (report.discrepancySummary.itemsWithBackDifferences.length > 0) {
    console.log(
      `🔄 Items with back differences: [${report.discrepancySummary.itemsWithBackDifferences.slice(0, 10).join(', ')}]${report.discrepancySummary.itemsWithBackDifferences.length > 10 ? '...' : ''}`
    );
  }
  if (report.discrepancySummary.itemsWithLeftDifferences.length > 0) {
    console.log(
      `⬅️  Items with left differences: [${report.discrepancySummary.itemsWithLeftDifferences.slice(0, 10).join(', ')}]${report.discrepancySummary.itemsWithLeftDifferences.length > 10 ? '...' : ''}`
    );
  }
  if (report.discrepancySummary.itemsWithRightDifferences.length > 0) {
    console.log(
      `➡️  Items with right differences: [${report.discrepancySummary.itemsWithRightDifferences.slice(0, 10).join(', ')}]${report.discrepancySummary.itemsWithRightDifferences.length > 10 ? '...' : ''}`
    );
  }

  // Show some examples of errors
  const errorItems = allComparisons.filter(c => c.error).slice(0, 3);
  if (errorItems.length > 0) {
    console.log('\n⚠️  Sample errors:');
    errorItems.forEach(item => {
      console.log(`  Item ${item.itemId}: ${item.error}`);
    });
  }

  if (report.discrepancySummary.itemsWithErrors.length > 0) {
    console.log(
      `\n❌ Items with errors: [${report.discrepancySummary.itemsWithErrors.slice(0, 10).join(', ')}]${report.discrepancySummary.itemsWithErrors.length > 10 ? '...' : ''}`
    );
  }
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
}

export { main, compareItemSvgs, getItemSvgs };
