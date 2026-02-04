# Архитектура Avito Scraper

## Обзор

Модульный scraper для Avito с поддержкой CLI, программного API, MCP сервера и прокси.

## Компоненты

### 1. Core Layer (Ядро)

#### BrowserManager (`src/core/browser.ts`)
- Управление Playwright браузером
- Stealth mode (скрытие webdriver)
- Поддержка прокси
- Реалистичные настройки (user-agent, viewport, locale)

```typescript
const browser = new BrowserManager(options);
await browser.initialize(proxy);
const page = await browser.newPage();
```

#### AvitoParser (`src/core/parser.ts`)
- Парсинг HTML страниц
- Извлечение данных (title, price, images, etc.)
- Детекция captcha и блокировок
- Ожидание загрузки контента

```typescript
const parser = new AvitoParser();
const results = await parser.parseSearchResults(page);
const hasCaptcha = await parser.detectCaptcha(page);
```

#### AvitoScraper (`src/core/scraper.ts`)
- Главный класс scraper'а
- Координирует browser и parser
- Реализует логику поиска и получения деталей
- Обработка ошибок и retry логика

```typescript
const scraper = new AvitoScraper(options);
const results = await scraper.search(filters);
const details = await scraper.getItemDetails(url);
```

### 2. Utils Layer (Утилиты)

#### delays.ts
- Случайные задержки для имитации поведения человека
- `randomDelay()` - случайное число в диапазоне
- `randomSleep()` - асинхронная задержка
- `humanDelay()` - "человеческая" задержка

#### user-agents.ts
- Пул реалистичных user-agents
- `getRandomUserAgent()` - случайный UA

#### url-builder.ts
- Построение URL для поиска
- `buildSearchUrl(filters)` - создание URL с параметрами
- `normalizeItemUrl(url)` - нормализация относительных URL
- `extractItemId(url)` - извлечение ID из URL

### 3. Plugin System

#### Output Plugins (`src/plugins/output/`)

**ConsoleOutput:**
- Красивый вывод в консоль
- Таблицы (cli-table3)
- Цветной текст (chalk)

**JsonOutput:**
- Сохранение в JSON файлы
- Автоматическое создание директорий
- Metadata (timestamp, count)

### 4. Interface Layer

#### CLI (`src/cli.ts`)
- Command-line интерфейс (commander.js)
- Команды: search, details, search-all
- Опции и аргументы
- Интеграция с output плагинами

#### MCP Server (планируется)
- Model Context Protocol сервер
- Tools: search_avito, get_item_details
- Интеграция с Claude Desktop

#### API (программный)
- Прямое использование классов
- Полный контроль над процессом
- Async/await интерфейс

## Data Flow (Поток данных)

```
CLI / API / MCP
      ↓
  AvitoScraper
      ↓
  ┌─────────┴─────────┐
  ↓                   ↓
BrowserManager    AvitoParser
  ↓                   ↓
Playwright       HTML Parsing
  ↓                   ↓
Avito.ru          Structured Data
  ↓                   ↓
  └─────────┬─────────┘
            ↓
      Output Plugins
```

## Типы данных

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
  location: string;
  url: string;
  imageUrl?: string;
  description?: string;
  publishedAt?: string;
}
```

### ItemDetails (extends SearchResult)
```typescript
{
  ...SearchResult,
  fullDescription: string;
  images: string[];
  seller: {
    name: string;
    rating?: number;
  };
  specifications?: Record<string, string>;
  viewsCount?: number;
}
```

## Anti-Detection Strategies

1. **User-Agent Rotation**
   - Пул реалистичных UA
   - Случайный выбор при каждой сессии

2. **Random Delays**
   - Задержки между запросами
   - Диапазон настраивается

3. **Stealth Mode**
   - Скрытие navigator.webdriver
   - Мок plugins и languages
   - Реалистичные настройки браузера

4. **Proxy Support (планируется)**
   - Ротация прокси
   - Разные стратегии
   - Авто-смена при ошибках

5. **Captcha Handling (планируется)**
   - Детекция captcha
   - Интеграция с anti-captcha.com
   - Ручной fallback

## Расширение функциональности

### Добавление нового output плагина

1. Создать класс в `src/plugins/output/`
2. Реализовать методы `write()` и `writeStream()`
3. Добавить в CLI или использовать программно

### Добавление captcha solver'а

1. Создать класс в `src/plugins/captcha/`
2. Реализовать интерфейс `ICaptchaSolver`
3. Передать в `ScraperOptions`

### Добавление proxy manager'а

1. Создать класс в `src/core/proxy-manager.ts`
2. Реализовать загрузку и ротацию
3. Интегрировать с `BrowserManager`

## Следующие шаги

1. **Proxy Support**
   - ProxyManager
   - Rotation strategies
   - Health check

2. **MCP Server**
   - @modelcontextprotocol/sdk integration
   - Tools registration
   - StdioServerTransport

3. **Anti-Captcha**
   - anti-captcha.com API
   - Cloudflare bypass
   - Manual solver fallback

4. **Advanced Features**
   - Кэширование
   - Rate limiting
   - Retry with exponential backoff
   - CSV export
   - Database storage
