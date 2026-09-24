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
  private page: Page | null = null;
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
        console.error(`Используем локальный Chrome: ${localChromePath}`);
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
        console.error(`Настраиваем локальный прокси-туннель для ${proxy.type} с авторизацией...`);
        console.error(`Верхний прокси: ${proxy.type}://${proxy.host}:${proxy.port} (пользователь: ${proxy.username})`);

        const upstreamUrl = `${proxy.type}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;

        // Create local HTTP proxy server with error handling
        this.proxyServer = new ProxyChain.Server({
          port: 0,
          verbose: false, // Disable verbose to reduce noise
          prepareRequestFunction: ({ request, username, password, hostname, port, isHttp }) => {
            console.error(`\n[PROXY] Запрос: ${request.method} ${request.url}`);
            console.error(`[PROXY] Цель: ${hostname}:${port} (isHttp: ${isHttp})`);
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
          console.error(`[PROXY] Соединение ${connectionId} закрыто — отправлено ${stats.srcTxBytes} байт, получено ${stats.srcRxBytes} байт`);
        });

        this.proxyServer.on('requestFailed', ({ request, error }: any) => {
          console.error(`[PROXY] Запрос не удался: ${request?.url}`);
          console.error(`[PROXY] Ошибка: ${error?.message}`);
        });

        await this.proxyServer.listen();
        const localPort = this.proxyServer.port;
        const localProxyUrl = `http://127.0.0.1:${localPort}`;

        console.error(`[PROXY] Локальный сервер запущен на порту ${localPort}`);
        console.error(`[PROXY] Браузер подключится к ${localProxyUrl}\n`);

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

  /**
   * Get a reusable page. Instead of opening a new browser window/tab on every
   * call (which looks suspicious to Avito and triggers captcha), reuse the same
   * page across requests. The page is created once and navigated repeatedly.
   */
  async getPage(): Promise<Page> {
    // If the browser process died or context was closed, re-initialize.
    if (!this.browser || !this.context || !this.browser.isConnected()) {
      await this.restartBrowser();
    }

    if (!this.page || this.page.isClosed()) {
      try {
        this.page = await this.context!.newPage();
        this.page.setDefaultTimeout(this.options.timeout || 30000);
      } catch (error: any) {
        // Context was closed even though the browser looked alive.
        console.error('Предупреждение: пересоздаём браузер после закрытия контекста:', error.message);
        await this.restartBrowser();
        this.page = await this.context!.newPage();
        this.page.setDefaultTimeout(this.options.timeout || 30000);
      }
    }

    return this.page;
  }

  /**
   * Fully shut down the current browser (if any) and start a fresh one.
   */
  private async restartBrowser(): Promise<void> {
    this.page = null;
    if (this.context) {
      try {
        await this.context.close();
      } catch {
        // ignore — already dead
      }
      this.context = null;
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // ignore — already dead
      }
      this.browser = null;
    }
    if (this.proxyServer) {
      try {
        await this.proxyServer.close(true);
      } catch {
        // ignore
      }
      this.proxyServer = null;
    }
    await this.initialize();
  }

  async close(): Promise<void> {
    this.page = null;
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    if (this.proxyServer) {
      console.error('Закрываем локальный прокси-сервер...');
      try {
        await this.proxyServer.close(true);
      } catch (err) {
        console.error('Ошибка при закрытии прокси-сервера:', err);
      }
      this.proxyServer = null;
    }
  }

  isInitialized(): boolean {
    if (this.browser === null || this.context === null) {
      return false;
    }
    // Check if the browser process is still connected
    if (!this.browser.isConnected()) {
      return false;
    }
    // Verify the context is still usable by checking a property
    try {
      this.context.pages();
    } catch {
      return false;
    }
    return true;
  }
}
