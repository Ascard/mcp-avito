/**
 * Core types for Avito scraper
 */

// ==================== Search & Results ====================

export interface SearchFilters {
  query: string;
  priceMin?: number;
  priceMax?: number;
  locationId?: number;
  categoryId?: number;
  page?: number;
  sort?: 'date' | 'price_asc' | 'price_desc' | 'default';
}

export interface SearchResult {
  id: string;
  title: string;
  price: number;
  currency?: string;
  location: string;
  url: string;
  imageUrl?: string;
  description?: string;
  publishedAt?: string;
}

export interface ItemDetails extends SearchResult {
  fullDescription: string;
  images: string[];
  seller: {
    name: string;
    rating?: number;
    registeredAt?: string;
    url?: string;
  };
  specifications?: Record<string, string>;
  viewsCount?: number;
  contactInfo?: {
    phone?: string;
    showPhone?: boolean;
  };
}

// ==================== Proxy ====================

export type ProxyType = 'http' | 'https' | 'socks4' | 'socks5';

export interface ProxyConfig {
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface ProxyStats {
  total: number;
  active: number;
  failed: number;
  successRate: Record<string, number>;
}

export type ProxyRotationStrategy = 'sequential' | 'random' | 'round-robin';

export interface ProxyOptions {
  enabled: boolean;
  listFile?: string;
  rotation?: ProxyRotationStrategy;
  rotateOnError?: boolean;
  rotateEveryN?: number;
  maxRetries?: number;
  healthCheck?: boolean;
}

// ==================== Scraper Options ====================

export interface ScraperOptions {
  headless?: boolean;
  timeout?: number;
  retries?: number;
  delayMs?: [number, number]; // [min, max]
  userAgent?: string;
  proxy?: ProxyOptions;
  captchaTimeoutMs?: number; // how long to wait for manual captcha solution (headed mode)
  captchaPollMs?: number; // how often to re-check whether captcha is solved
  manualCaptchaFallback?: boolean; // restart browser in headed mode so the user can solve the captcha
}

// ==================== Captcha ====================

export interface ICaptchaSolver {
  solve(page: any, captchaType: string): Promise<boolean>;
  isEnabled(): boolean;
}

// ==================== Output ====================

export interface IOutputPlugin {
  write(data: any): Promise<void>;
  writeStream(data: AsyncIterator<any>): Promise<void>;
}

// ==================== Errors ====================

export class ScraperError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ScraperError';
  }
}

export class CaptchaError extends ScraperError {
  constructor(message: string, details?: any) {
    super(message, 'CAPTCHA_DETECTED', details);
    this.name = 'CaptchaError';
  }
}

export class ProxyError extends ScraperError {
  constructor(message: string, details?: any) {
    super(message, 'PROXY_ERROR', details);
    this.name = 'ProxyError';
  }
}
