/**
 * Random delays for anti-bot detection
 */

export function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function randomSleep(min: number, max: number): Promise<void> {
  const delay = randomDelay(min, max);
  return sleep(delay);
}

/**
 * Human-like delays with some randomness
 */
export async function humanDelay(): Promise<void> {
  // Random delay between 1-3 seconds
  const base = randomDelay(1000, 3000);
  // Add some micro-randomness
  const micro = randomDelay(0, 500);
  return sleep(base + micro);
}
