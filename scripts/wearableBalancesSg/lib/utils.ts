import chalk from 'chalk';

export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  operationName: string = 'operation'
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        console.error(
          chalk.red(
            `❌ ${operationName} failed after ${maxRetries + 1} attempts:`,
            lastError.message
          )
        );
        throw lastError;
      }

      // Calculate exponential backoff delay
      const delayMs = baseDelay * Math.pow(2, attempt);
      console.log(
        chalk.yellow(
          `⚠️  ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms...`
        )
      );
      console.log(chalk.gray(`   Error: ${lastError.message}`));

      await delay(delayMs);
    }
  }

  throw lastError!;
}

export function calculateDiscrepancy(subgraphBalance: string, onChainBalance: string): string {
  const sgBalance = parseInt(subgraphBalance) || 0;
  const ocBalance = parseInt(onChainBalance) || 0;
  return (sgBalance - ocBalance).toString();
}

export function formatBalance(balance: string): string {
  const num = parseInt(balance) || 0;
  return num.toLocaleString();
}

export function isZeroAddress(address: string): boolean {
  return address.toLowerCase() === '0x0000000000000000000000000000000000000000';
}
