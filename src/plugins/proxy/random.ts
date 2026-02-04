/**
 * Random proxy rotation strategy
 * Selects a random proxy from available pool
 */

import type { ProxyConfig } from '../../core/types.js';
import type { IProxyRotationStrategy } from './base.js';

export class RandomRotation implements IProxyRotationStrategy {
  private proxies: ProxyConfig[] = [];
  private failedProxies: Set<string> = new Set();

  constructor(proxies: ProxyConfig[] = []) {
    this.proxies = proxies;
  }

  next(): ProxyConfig | null {
    const available = this.getAvailableProxies();

    if (available.length === 0) {
      return null;
    }

    // Select random proxy
    const randomIndex = Math.floor(Math.random() * available.length);
    return available[randomIndex];
  }

  markFailed(proxy: ProxyConfig): void {
    const key = this.getProxyKey(proxy);
    this.failedProxies.add(key);
    console.error(`Proxy marked as failed: ${key}`);
  }

  markSuccess(proxy: ProxyConfig): void {
    const key = this.getProxyKey(proxy);
    this.failedProxies.delete(key);
  }

  reset(): void {
    this.failedProxies.clear();
  }

  getAvailableCount(): number {
    return this.getAvailableProxies().length;
  }

  addProxy(proxy: ProxyConfig): void {
    this.proxies.push(proxy);
  }

  removeProxy(proxy: ProxyConfig): void {
    const key = this.getProxyKey(proxy);
    this.proxies = this.proxies.filter((p) => this.getProxyKey(p) !== key);
  }

  private getAvailableProxies(): ProxyConfig[] {
    return this.proxies.filter((p) => !this.failedProxies.has(this.getProxyKey(p)));
  }

  private getProxyKey(proxy: ProxyConfig): string {
    return `${proxy.type}://${proxy.host}:${proxy.port}`;
  }
}
