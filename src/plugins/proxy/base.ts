/**
 * Base interfaces for proxy rotation strategies
 */

import type { ProxyConfig } from '../../core/types.js';

export interface IProxyRotationStrategy {
  /**
   * Get next proxy from the pool
   */
  next(): ProxyConfig | null;

  /**
   * Mark proxy as failed
   */
  markFailed(proxy: ProxyConfig): void;

  /**
   * Mark proxy as successful
   */
  markSuccess(proxy: ProxyConfig): void;

  /**
   * Reset rotation state
   */
  reset(): void;

  /**
   * Get available proxies count
   */
  getAvailableCount(): number;

  /**
   * Add proxy to the pool
   */
  addProxy(proxy: ProxyConfig): void;

  /**
   * Remove proxy from the pool
   */
  removeProxy(proxy: ProxyConfig): void;
}
