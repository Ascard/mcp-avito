/**
 * Browser manager with Playwright
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import ProxyChain from 'proxy-chain';
import { getRandomUserAgent } from '../utils/user-agents.js';
import type { ProxyConfig, ScraperOptions } from './types.js';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private options: ScraperOptions;
  private proxyServer: any = null;

  constructor(options: ScraperOptions = {}) {
    this.options = {
      headless: true,
      timeout: 30000,
      ...options,
    };
  }

  async initialize(proxy?: ProxyConfig): Promise<void> {
    const launchOptions: any = {
      headless: this.options.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    };

    // Use local Chrome if available
    const localChromePath = process.env.CHROME_EXECUTABLE_PATH || './chrome-win64/chrome.exe';
    try {
      const fs = await import('fs');
      if (fs.existsSync(localChromePath)) {
        launchOptions.executablePath = localChromePath;
        console.error(`Using local Chrome: ${localChromePath}`);
      }
    } catch {
      // If local Chrome not found, use Playwright's default
    }

    // Add proxy if provided
    if (proxy) {
      // Check if SOCKS proxy with authentication
      const isSocksWithAuth =
        (proxy.type === 'socks4' || proxy.type === 'socks5') &&
        proxy.username &&
        proxy.password;

      if (isSocksWithAuth) {
        console.error(`Setting up local proxy tunnel for ${proxy.type} with auth...`);
        console.error(`Upstream: ${proxy.type}://${proxy.host}:${proxy.port} (user: ${proxy.username})`);

        const upstreamUrl = `${proxy.type}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;

        // Create local HTTP proxy server with error handling
        this.proxyServer = new ProxyChain.Server({
          port: 0,
          verbose: false, // Disable verbose to reduce noise
          prepareRequestFunction: ({ request, username, password, hostname, port, isHttp }) => {
            console.error(`\n[PROXY] Request: ${request.method} ${request.url}`);
            console.error(`[PROXY] Target: ${hostname}:${port} (isHttp: ${isHttp})`);
            return {
              upstreamProxyUrl: upstreamUrl,
              // Try forcing connection timeout
              requestAuthentication: false,
              // Don't require auth on local proxy
              failMsg: 'Proxy connection failed',
            };
          },
        });

        // Add error handler
        this.proxyServer.on('connectionClosed', ({ connectionId, stats }: any) => {
          console.error(`[PROXY] Connection ${connectionId} closed - ${stats.srcTxBytes} bytes sent, ${stats.srcRxBytes} bytes received`);
        });

        this.proxyServer.on('requestFailed', ({ request, error }: any) => {
          console.error(`[PROXY] Request failed: ${request?.url}`);
          console.error(`[PROXY] Error: ${error?.message}`);
        });

        await this.proxyServer.listen();
        const localPort = this.proxyServer.port;
        const localProxyUrl = `http://127.0.0.1:${localPort}`;

        console.error(`[PROXY] Local server running on port ${localPort}`);
        console.error(`[PROXY] Browser will connect to ${localProxyUrl}\n`);

        launchOptions.proxy = {
          server: localProxyUrl,
        };
      } else {
        // HTTP/HTTPS proxy or SOCKS without auth - use directly
        launchOptions.proxy = {
          server: `${proxy.type}://${proxy.host}:${proxy.port}`,
        };
        if (proxy.username && proxy.password) {
          launchOptions.proxy.username = proxy.username;
          launchOptions.proxy.password = proxy.password;
        }
      }
    }

    this.browser = await chromium.launch(launchOptions);

    // Create context with stealth settings
    this.context = await this.browser.newContext({
      userAgent: this.options.userAgent || getRandomUserAgent(),
      viewport: {
        width: 1920,
        height: 1080,
      },
      locale: 'ru-RU',
      timezoneId: 'Europe/Moscow',
    });

    // Add stealth scripts
    await this.context.addInitScript(() => {
      // @ts-ignore - runs in browser context
      // Hide webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // @ts-ignore - runs in browser context
      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // @ts-ignore - runs in browser context
      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ru-RU', 'ru', 'en-US', 'en'],
      });
    });
  }

  async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    const page = await this.context.newPage();

    // Set timeout
    page.setDefaultTimeout(this.options.timeout || 30000);

    return page;
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    if (this.proxyServer) {
      console.error('Closing local proxy server...');
      try {
        await this.proxyServer.close(true);
      } catch (err) {
        console.error('Error closing proxy server:', err);
      }
      this.proxyServer = null;
    }
  }

  isInitialized(): boolean {
    return this.browser !== null && this.context !== null;
  }
}
