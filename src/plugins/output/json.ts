/**
 * JSON file output plugin
 */

import { writeFile } from 'fs/promises';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';
import type { SearchResult, ItemDetails } from '../../core/types.js';

export class JsonOutput {
  /**
   * Save results to JSON file
   */
  async saveResults(results: SearchResult[], filename: string): Promise<void> {
    await this.ensureDirectory(filename);

    const data = {
      timestamp: new Date().toISOString(),
      count: results.length,
      results,
    };

    await writeFile(filename, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Save item details to JSON file
   */
  async saveDetails(details: ItemDetails, filename: string): Promise<void> {
    await this.ensureDirectory(filename);

    const data = {
      timestamp: new Date().toISOString(),
      details,
    };

    await writeFile(filename, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Ensure output directory exists
   */
  private async ensureDirectory(filename: string): Promise<void> {
    const dir = dirname(filename);
    try {
      await mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }
}
