export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retryWithDelay<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit =
        error?.info?.error?.message?.includes('rate limit') ||
        error?.message?.includes('rate limit') ||
        error?.code === 'CALL_EXCEPTION';

      if (attempt === maxRetries || !isRateLimit) {
        throw error;
      }

      const delayMs = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Rate limit hit, retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})`);
      await delay(delayMs);
    }
  }
  throw new Error('Max retries exceeded');
}
