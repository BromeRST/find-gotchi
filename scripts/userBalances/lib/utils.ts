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
      const isRetryableError =
        error?.info?.error?.message?.includes('rate limit') ||
        error?.message?.includes('rate limit') ||
        error?.code === 'CALL_EXCEPTION' ||
        error?.message?.includes('timeout') ||
        error?.message?.includes('ECONNRESET') ||
        error?.message?.includes('ENOTFOUND') ||
        error?.message?.includes('network');

      if (attempt === maxRetries || !isRetryableError) {
        throw error;
      }

      const delayMs = baseDelay * Math.pow(2, attempt - 1);
      console.log(
        `Network error encountered, retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries}): ${error?.message}`
      );
      await delay(delayMs);
    }
  }
  throw new Error('Max retries exceeded');
}
