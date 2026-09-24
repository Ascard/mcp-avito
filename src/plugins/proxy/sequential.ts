/**
 * Sequential proxy rotation strategy
 * Cycles through proxies one by one
 */

import type { ProxyConfig } from '../../core/types.js';
import type { IProxyRotationStrategy } from './base.js';

export class SequentialRotation implements IProxyRotationStrategy {
  private proxies: ProxyConfig[] = [];
  private currentIndex: number = 0;
  private failedProxies: Set<string> = new Set();

  constructor(proxies: ProxyConfig[] = []) {
    this.proxies = proxies;
  }

  next(): ProxyConfig | null {
    if (this.proxies.length === 0) {
      return null;
    }

    // Try to find a non-failed proxy
    const startIndex = this.currentIndex;
    let attempts = 0;

    while (attempts < this.proxies.length) {
      const proxy = this.proxies[this.currentIndex];
      const proxyKey = this.getProxyKey(proxy);

      // Move to next index
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      attempts++;

      // Skip failed proxies
      if (!this.failedProxies.has(proxyKey)) {
        return proxy;
      }
    }

    // All proxies are failed
    return null;
  }

  markFailed(proxy: ProxyConfig): void {
    const key = this.getProxyKey(proxy);
    this.failedProxies.add(key);
    console.error(`Прокси помечен как нерабочий: ${key}`);
  }

  markSuccess(proxy: ProxyConfig): void {
    const key = this.getProxyKey(proxy);
    this.failedProxies.delete(key);
  }

  reset(): void {
    this.currentIndex = 0;
    this.failedProxies.clear();
  }

  getAvailableCount(): number {
    return this.proxies.length - this.failedProxies.size;
  }

  addProxy(proxy: ProxyConfig): void {
    this.proxies.push(proxy);
  }

  removeProxy(proxy: ProxyConfig): void {
    const key = this.getProxyKey(proxy);
    this.proxies = this.proxies.filter((p) => this.getProxyKey(p) !== key);
  }

  private getProxyKey(proxy: ProxyConfig): string {
    return `${proxy.type}://${proxy.host}:${proxy.port}`;
  }
}
