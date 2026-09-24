/**
 * Proxy manager for loading and rotating proxies
 */

import { readFile } from 'fs/promises';
import type { ProxyConfig, ProxyRotationStrategy, ProxyStats } from './types.js';
import type { IProxyRotationStrategy } from '../plugins/proxy/base.js';
import { SequentialRotation } from '../plugins/proxy/sequential.js';
import { RandomRotation } from '../plugins/proxy/random.js';
import { RoundRobinRotation } from '../plugins/proxy/round-robin.js';

export class ProxyManager {
  private strategy: IProxyRotationStrategy;
  private currentProxy: ProxyConfig | null = null;
  private rotationStrategy: ProxyRotationStrategy;
  private rotateEveryN: number;
  private requestCount: number = 0;

  constructor(
    proxies: ProxyConfig[] = [],
    rotationStrategy: ProxyRotationStrategy = 'sequential',
    rotateEveryN: number = 0
  ) {
    this.rotationStrategy = rotationStrategy;
    this.rotateEveryN = rotateEveryN;
    this.strategy = this.createStrategy(rotationStrategy, proxies);
  }

  /**
   * Load proxies from file
   * Format: type://[username:password@]host:port
   * Example: socks5://user:pass@127.0.0.1:1080
   */
  async loadFromFile(filePath: string): Promise<number> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      let loadedCount = 0;

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }

        const proxy = this.parseProxyString(trimmed);
        if (proxy) {
          this.strategy.addProxy(proxy);
          loadedCount++;
        } else {
          console.error(`Не удалось распарсить прокси: ${trimmed}`);
        }
      }

      console.error(`Загружено ${loadedCount} прокси из ${filePath}`);
      return loadedCount;
    } catch (error) {
      console.error(`Не удалось загрузить прокси из ${filePath}:`, error);
      return 0;
    }
  }

  /**
   * Parse proxy string
   * Supports: http://, https://, socks4://, socks5://
   * With or without auth: user:pass@host:port
   */
  private parseProxyString(proxyString: string): ProxyConfig | null {
    try {
      // Match pattern: protocol://[username:password@]host:port
      const regex = /^(https?|socks[45]):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/;
      const match = proxyString.match(regex);

      if (!match) {
        return null;
      }

      const [, type, username, password, host, port] = match;

      return {
        type: type as 'http' | 'https' | 'socks4' | 'socks5',
        host,
        port: parseInt(port, 10),
        username: username || undefined,
        password: password || undefined,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get current or next proxy
   */
  getProxy(forceRotate: boolean = false): ProxyConfig | null {
    // Check if rotation needed
    const shouldRotate =
      forceRotate ||
      !this.currentProxy ||
      (this.rotateEveryN > 0 && this.requestCount >= this.rotateEveryN);

    if (shouldRotate) {
      this.currentProxy = this.strategy.next();
      this.requestCount = 0;

      if (this.currentProxy) {
        const proxyStr = this.formatProxyString(this.currentProxy);
        console.error(`Используем прокси: ${proxyStr}`);
      }
    }

    this.requestCount++;
    return this.currentProxy;
  }

  /**
   * Mark current proxy as failed and rotate
   */
  markFailed(): void {
    if (this.currentProxy) {
      this.strategy.markFailed(this.currentProxy);
      // Force rotation on next getProxy call
      this.currentProxy = null;
      this.requestCount = 0;
    }
  }

  /**
   * Mark current proxy as successful
   */
  markSuccess(): void {
    if (this.currentProxy) {
      this.strategy.markSuccess(this.currentProxy);
    }
  }

  /**
   * Get statistics
   */
  getStats(): ProxyStats {
    const availableCount = this.strategy.getAvailableCount();

    // Get detailed stats if available (round-robin)
    let successRate: Record<string, number> = {};
    if ('getStats' in this.strategy && typeof this.strategy.getStats === 'function') {
      const detailedStats = (this.strategy as any).getStats();
      successRate = Object.keys(detailedStats).reduce((acc, key) => {
        acc[key] = detailedStats[key].successRate;
        return acc;
      }, {} as Record<string, number>);
    }

    return {
      total: availableCount,
      active: availableCount,
      failed: 0, // Could track this if needed
      successRate,
    };
  }

  /**
   * Reset rotation state
   */
  reset(): void {
    this.strategy.reset();
    this.currentProxy = null;
    this.requestCount = 0;
  }

  /**
   * Change rotation strategy
   */
  setRotationStrategy(strategy: ProxyRotationStrategy, proxies?: ProxyConfig[]): void {
    const currentProxies = proxies || this.getAllProxies();
    this.rotationStrategy = strategy;
    this.strategy = this.createStrategy(strategy, currentProxies);
    this.currentProxy = null;
    this.requestCount = 0;
  }

  /**
   * Get all proxies from current strategy
   */
  private getAllProxies(): ProxyConfig[] {
    // This is a bit hacky, but works for our strategies
    const proxies: ProxyConfig[] = [];
    const tempStrategy = this.strategy;

    // Extract proxies by trying to get next until we cycle through all
    for (let i = 0; i < 1000; i++) {
      // arbitrary limit
      const proxy = tempStrategy.next();
      if (!proxy) break;

      const proxyKey = `${proxy.type}://${proxy.host}:${proxy.port}`;
      if (!proxies.some((p) => `${p.type}://${p.host}:${p.port}` === proxyKey)) {
        proxies.push(proxy);
      }

      if (proxies.length > 100) break; // safety limit
    }

    return proxies;
  }

  /**
   * Create rotation strategy instance
   */
  private createStrategy(
    type: ProxyRotationStrategy,
    proxies: ProxyConfig[]
  ): IProxyRotationStrategy {
    switch (type) {
      case 'random':
        return new RandomRotation(proxies);
      case 'round-robin':
        return new RoundRobinRotation(proxies);
      case 'sequential':
      default:
        return new SequentialRotation(proxies);
    }
  }

  /**
   * Format proxy config to string
   */
  private formatProxyString(proxy: ProxyConfig): string {
    const auth = proxy.username && proxy.password ? `${proxy.username}:***@` : '';
    return `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
  }
}
