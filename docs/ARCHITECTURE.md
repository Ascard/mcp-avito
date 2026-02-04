# Архитектура проекта

## Обзор

Avito Scraper построен по модульной архитектуре с четким разделением ответственности:

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                            │
│                      (Commander.js)                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                    AvitoScraper                              │
│              (Orchestration Layer)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ BrowserMgr   │  │ ProxyManager │  │ AvitoParser  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
│  Playwright  │ │ proxy-chain │ │  Plugins   │
│   (Chrome)   │ │   (SOCKS5)  │ │  (Output)  │
└──────────────┘ └─────────────┘ └────────────┘
```

---

## Слои приложения

### 1. CLI Layer (`src/cli.ts`)

**Ответственность:** Интерфейс командной строки

**Компоненты:**
- Commander.js для парсинга аргументов
- 3 команды: `search`, `details`, `search-all`
- Валидация входных параметров
- Вывод результатов (ConsoleOutput, JsonOutput)

**Поток:**
```
User Input → CLI Parse → Scraper Init → Execute → Output
```

---

### 2. Orchestration Layer (`src/core/scraper.ts`)

**Ответственность:** Координация всех компонентов

**Компоненты:**
- `AvitoScraper` - главный класс
- Управление жизненным циклом браузера
- Интеграция прокси менеджера
- Обработка ошибок и retry логика

**Методы:**
- `initialize()` - Инициализация браузера и прокси
- `search(filters)` - Поиск товаров
- `getItemDetails(url)` - Детали товара
- `searchAllPages(filters)` - Генератор для всех страниц
- `close()` - Закрытие ресурсов

---

### 3. Browser Layer (`src/core/browser.ts`)

**Ответственность:** Управление Playwright браузером

**Возможности:**
- Запуск Chromium (headless/headed)
- Локальный Chrome (`chrome-win64/chrome.exe`)
- Stealth режим (скрытие webdriver)
- Proxy интеграция

**Stealth техники:**
```javascript
// Скрытие webdriver
navigator.webdriver = false

// Мок плагинов
navigator.plugins = [1,2,3,4,5]

// Реалистичные настройки
locale: 'ru-RU'
timezoneId: 'Europe/Moscow'
viewport: 1920x1080
```

**SOCKS5 Proxy Flow:**
```
Browser → Local HTTP Proxy (proxy-chain) → SOCKS5 Server → Target
        (localhost:random)                 (with auth)
```

---

### 4. Proxy Layer

#### ProxyManager (`src/core/proxy-manager.ts`)

**Ответственность:** Управление пулом прокси

**Возможности:**
- Загрузка из файла (формат: `protocol://[user:pass@]host:port`)
- Парсинг SOCKS4/5, HTTP/HTTPS
- Выбор стратегии ротации
- Отслеживание статистики

**Rotation Strategies:**

1. **Sequential** (`src/plugins/proxy/sequential.ts`)
   - Линейный проход по списку
   - Начинает сначала после конца

2. **Random** (`src/plugins/proxy/random.ts`)
   - Случайный выбор из пула
   - Может повторяться

3. **Round-Robin** (`src/plugins/proxy/round-robin.ts`)
   - Циклический проход с метриками
   - Отключение failed прокси на 5 минут
   - Cooldown период для восстановления

#### proxy-chain Integration

**Проблема:** Chromium не поддерживает SOCKS5 с авторизацией

**Решение:** Локальный HTTP proxy туннель

```typescript
// 1. Создать локальный HTTP proxy
proxyServer = new ProxyChain.Server({
  port: 0, // random port
  prepareRequestFunction: () => ({
    upstreamProxyUrl: 'socks5://user:pass@host:port'
  })
});

// 2. Запустить сервер
await proxyServer.listen();

// 3. Chromium подключается к локальному proxy
chromium.launch({
  proxy: { server: `http://127.0.0.1:${localPort}` }
});
```

---

### 5. Parser Layer (`src/core/parser.ts`)

**Ответственность:** Извлечение данных из HTML

**Методы:**

1. **parseSearchResults(page)**
   - Селектор: `[data-marker="item"]`
   - Извлекает: id, title, price, url, imageUrl, location

2. **parseItemDetails(page)**
   - Детальная информация о товаре
   - Селлер, параметры, описание

3. **detectCaptcha(page)**
   - Детектирование капчи по селекторам

4. **isBlocked(page)**
   - Проверка блокировки доступа

**Selectors Map:**
```typescript
{
  item: '[data-marker="item"]',
  title: '[itemprop="name"]',
  price: '[itemprop="price"]',
  url: '[data-marker="item-title"]',
  captcha: '[data-marker="captcha"]',
  // ...
}
```

---

### 6. Utils Layer (`src/utils/`)

**Компоненты:**

1. **delays.ts**
   - `randomSleep(min, max)` - Случайная задержка
   - Anti-bot protection

2. **user-agents.ts**
   - Пул реалистичных User-Agent
   - Chrome, Firefox, Safari на Windows/Mac

3. **url-builder.ts**
   - `buildSearchUrl(filters)` - Построение URL поиска
   - Кодирование параметров

---

### 7. Output Plugins (`src/plugins/output/`)

**Интерфейс:**
```typescript
interface OutputPlugin {
  displayResults(results: SearchResult[]): void;
  saveResults(results: SearchResult[], path: string): Promise<void>;
}
```

**Реализации:**

1. **ConsoleOutput** - Таблица с цветами (chalk + cli-table3)
2. **JsonOutput** - JSON с timestamp

---

## Типы данных (`src/core/types.ts`)

### SearchFilters
```typescript
{
  query: string;
  priceMin?: number;
  priceMax?: number;
  locationId?: number;
  page?: number;
  sort?: 'date' | 'price_asc' | 'price_desc';
}
```

### SearchResult
```typescript
{
  id: string;
  title: string;
  price: number;
  currency: string;
  location: string;
  url: string;
  imageUrl: string;
  description: string;
  publishedAt: string;
}
```

### ItemDetails
```typescript
extends SearchResult {
  seller: {
    name: string;
    rating?: number;
    reviewsCount?: number;
  };
  views: number;
  images: string[];
  parameters: Record<string, string>;
}
```

### ProxyConfig
```typescript
{
  type: 'http' | 'https' | 'socks4' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
}
```

---

## Потоки выполнения

### 1. Поиск товаров

```
┌─────────┐
│ CLI     │ search "Samsung SSD" --proxy-file ...
└────┬────┘
     │
┌────▼────────────────┐
│ AvitoScraper        │
│ 1. initialize()     │ ← Load proxies from file
│ 2. Get proxy        │ ← ProxyManager.getProxy()
│ 3. Init browser     │ ← BrowserManager.initialize(proxy)
└────┬────────────────┘
     │
┌────▼────────────────┐
│ Browser             │
│ IF SOCKS5+auth:     │
│   1. Start local    │ ← proxy-chain.Server
│      HTTP proxy     │
│   2. Launch Chrome  │ → Connect to localhost proxy
│ ELSE:               │
│   Launch with proxy │ → Direct proxy
└────┬────────────────┘
     │
┌────▼────────────────┐
│ Scraper.search()    │
│ 1. Build URL        │ ← buildSearchUrl(filters)
│ 2. page.goto(url)   │ → Navigate
│ 3. Wait & delay     │ ← randomSleep()
│ 4. Check captcha    │ ← parser.detectCaptcha()
│ 5. Parse results    │ ← parser.parseSearchResults()
└────┬────────────────┘
     │
┌────▼────────────────┐
│ Output              │
│ - Console table     │ ← ConsoleOutput
│ - JSON file         │ ← JsonOutput
└─────────────────────┘
```

### 2. Proxy ротация (Round-Robin)

```
Request 1 → Proxy A (success) → Mark success, increment counter
Request 2 → Proxy B (success) → Mark success
Request 3 → Proxy C (fail)    → Mark failed, add to cooldown
Request 4 → Proxy A (success) → Continue rotation
...
After 5min → Check cooldown  → Retry failed proxies
```

---

## Обработка ошибок

### Captcha Detection

```typescript
if (await parser.detectCaptcha(page)) {
  if (!headless) {
    // Wait 60s for manual solution
    console.log('Please solve captcha...');
    await page.waitForTimeout(60000);
  } else {
    throw new CaptchaError('Captcha detected');
  }
}
```

### Proxy Failures

```typescript
try {
  await page.goto(url);
} catch (error) {
  if (proxyManager) {
    proxyManager.markFailed(); // Mark current proxy as failed
    // Retry with new proxy
  }
}
```

### Browser Crashes

```typescript
finally {
  await page.close();       // Always close page
  await browser.close();    // Always close browser
  if (proxyServer) {
    await proxyServer.close(); // Close proxy-chain server
  }
}
```

---

## Расширяемость

### Добавление новой стратегии ротации

1. Создать файл `src/plugins/proxy/my-strategy.ts`
2. Реализовать интерфейс `IProxyRotationStrategy`
3. Зарегистрировать в `ProxyManager.createStrategy()`

### Добавление нового output формата

1. Создать файл `src/plugins/output/my-output.ts`
2. Реализовать методы `displayResults()`, `saveResults()`
3. Использовать в CLI

### MCP Server (планируется)

```
┌──────────────┐
│ Claude       │
│ Desktop      │
└──────┬───────┘
       │ MCP Protocol
┌──────▼───────────────────┐
│ MCP Server               │
│ Tools:                   │
│ - avito_search           │ ← AvitoScraper.search()
│ - avito_get_details      │ ← AvitoScraper.getItemDetails()
│ - avito_search_all       │ ← AvitoScraper.searchAllPages()
└──────────────────────────┘
```

---

## Performance

### Оптимизации

1. **Lazy browser init** - Браузер запускается только при первом запросе
2. **Reuse browser context** - Один контекст для множества страниц
3. **Parallel proxy testing** - (планируется) Проверка прокси параллельно
4. **Generator для пагинации** - Память не растет при `searchAllPages()`

### Bottlenecks

1. **Browser startup** - ~2-3 секунды
2. **Page load** - ~3-5 секунд с задержками
3. **Proxy-chain overhead** - ~100-200ms на SOCKS5 туннель

---

## Безопасность

### Что скрыто от детекции

✅ webdriver флаг
✅ navigator.plugins
✅ navigator.languages
✅ User-Agent ротация
✅ Случайные задержки
✅ Реалистичный viewport

### Что может выдать бота

❌ IP адрес (решается прокси)
❌ Canvas fingerprint (не реализовано)
❌ WebRTC leak (не реализовано)
❌ Паттерны поведения (решается задержками)

---

_Обновлено: 2026-02-04_
