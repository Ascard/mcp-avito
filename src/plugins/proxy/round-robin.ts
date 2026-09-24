/**
 * Round-robin proxy rotation strategy
 * Distributes load evenly and tracks success rates
 */

import type { ProxyConfig } from '../../core/types.js';
import type { IProxyRotationStrategy } from './base.js';

interface ProxyStats {
  proxy: ProxyConfig;
  successCount: number;
  failCount: number;
  lastUsed: number;
  consecutiveFails: number;
}

export class RoundRobinRotation implements IProxyRotationStrategy {
  private proxyStats: Map<string, ProxyStats> = new Map();
  private currentIndex: number = 0;
  private maxConsecutiveFails: number;
  private failCooldownMs: number;

  constructor(
    proxies: ProxyConfig[] = [],
    maxConsecutiveFails: number = 3,
    failCooldownMs: number = 300000 // 5 minutes
  ) {
    this.maxConsecutiveFails = maxConsecutiveFails;
    this.failCooldownMs = failCooldownMs;

    proxies.forEach((proxy) => {
      const key = this.getProxyKey(proxy);
      this.proxyStats.set(key, {
        proxy,
        successCount: 0,
        failCount: 0,
        lastUsed: 0,
        consecutiveFails: 0,
      });
    });
  }

  next(): ProxyConfig | null {
    const available = this.getAvailableProxies();

    if (available.length === 0) {
      return null;
    }

    // Get next proxy in round-robin fashion
    const proxy = available[this.currentIndex % available.length];
    this.currentIndex = (this.currentIndex + 1) % available.length;

    // Update last used time
    const key = this.getProxyKey(proxy);
    const stats = this.proxyStats.get(key);
    if (stats) {
      stats.lastUsed = Date.now();
    }

    return proxy;
  }

  markFailed(proxy: ProxyConfig): void {
    const key = this.getProxyKey(proxy);
    const stats = this.proxyStats.get(key);

    if (stats) {
      stats.failCount++;
      stats.consecutiveFails++;

      if (stats.consecutiveFails >= this.maxConsecutiveFails) {
        console.error(
          `Прокси ${key} превысило максимум последовательных сбоев (${this.maxConsecutiveFails}), временно отключён`
        );
      }
    }
  }

  markSuccess(proxy: ProxyConfig): void {
    const key = this.getProxyKey(proxy);
    const stats = this.proxyStats.get(key);

    if (stats) {
      stats.successCount++;
      stats.consecutiveFails = 0; // Reset consecutive fails on success
    }
  }

  reset(): void {
    this.currentIndex = 0;
    this.proxyStats.forEach((stats) => {
      stats.consecutiveFails = 0;
    });
  }

  getAvailableCount(): number {
    return this.getAvailableProxies().length;
  }

  addProxy(proxy: ProxyConfig): void {
    const key = this.getProxyKey(proxy);
    if (!this.proxyStats.has(key)) {
      this.proxyStats.set(key, {
        proxy,
        successCount: 0,
        failCount: 0,
        lastUsed: 0,
        consecutiveFails: 0,
      });
    }
  }

  removeProxy(proxy: ProxyConfig): void {
    const key = this.getProxyKey(proxy);
    this.proxyStats.delete(key);
  }

  getStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    this.proxyStats.forEach((stat, key) => {
      const total = stat.successCount + stat.failCount;
      stats[key] = {
        successRate: total > 0 ? (stat.successCount / total) * 100 : 0,
        successCount: stat.successCount,
        failCount: stat.failCount,
        consecutiveFails: stat.consecutiveFails,
      };
    });

    return stats;
  }

  private getAvailableProxies(): ProxyConfig[] {
    const now = Date.now();
    const available: ProxyConfig[] = [];

    this.proxyStats.forEach((stats, key) => {
      // Skip if too many consecutive fails and cooldown not expired
      if (stats.consecutiveFails >= this.maxConsecutiveFails) {
        const timeSinceLastUse = now - stats.lastUsed;
        if (timeSinceLastUse < this.failCooldownMs) {
          return; // Skip this proxy
        }
        // Reset consecutive fails after cooldown
        stats.consecutiveFails = 0;
      }

      available.push(stats.proxy);
    });

    return available;
  }

  private getProxyKey(proxy: ProxyConfig): string {
    return `${proxy.type}://${proxy.host}:${proxy.port}`;
  }
}
