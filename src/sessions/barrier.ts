/**
 * Barrier Module
 * Provides a synchronization primitive for coordinating multiple events
 */

/**
 * A Barrier synchronizes multiple named "parts" arriving in any order.
 * Once all parts have arrived, the whenReady promise resolves.
 * Used to coordinate events like 'genDone' and 'messageReceived'.
 */
export class Barrier {
  private readonly expectedParts: Set<string>;
  private readonly arrivedParts: Set<string>;
  private resolveReady: (() => void) | null = null;
  readonly whenReady: Promise<void>;

  /**
   * Creates a new Barrier
   * @param parts - Array of part names that must arrive before the barrier opens
   */
  constructor(parts: string[]) {
    if (!parts || parts.length === 0) {
      throw new Error('Barrier requires at least one part');
    }

    // Check for duplicates
    const uniqueParts = new Set(parts);
    if (uniqueParts.size !== parts.length) {
      throw new Error('Barrier parts must be unique');
    }

    this.expectedParts = new Set(parts);
    this.arrivedParts = new Set();

    // Create the promise that resolves when all parts arrive
    this.whenReady = new Promise<void>(resolve => {
      this.resolveReady = resolve;
    });
  }

  /**
   * Signal that a part has arrived
   * @param part - The name of the part that has arrived
   * @throws Error if the part name is not expected or has already arrived
   */
  arrive(part: string): void {
    if (!this.expectedParts.has(part)) {
      throw new Error(`Unexpected part: ${part}`);
    }

    if (this.arrivedParts.has(part)) {
      throw new Error(`Part already arrived: ${part}`);
    }

    this.arrivedParts.add(part);

    // If all parts have arrived, resolve the promise
    if (
      this.arrivedParts.size === this.expectedParts.size &&
      this.resolveReady
    ) {
      this.resolveReady();
    }
  }

  /**
   * Check if all parts have arrived
   * @returns true if all parts have arrived
   */
  isReady(): boolean {
    return this.arrivedParts.size === this.expectedParts.size;
  }

  /**
   * Get the set of parts that have not yet arrived
   * @returns Set of missing part names
   */
  getMissingParts(): Set<string> {
    const missing = new Set<string>();
    for (const part of this.expectedParts) {
      if (!this.arrivedParts.has(part)) {
        missing.add(part);
      }
    }
    return missing;
  }
}
