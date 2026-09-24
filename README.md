# Avito Scraper

Модульный scraper для Avito с поддержкой CLI, MCP сервера и прокси.

📚 **Документация:** [USAGE.md](docs/USAGE.md) | [PLAN.md](docs/PLAN.md)

## Возможности

✅ **MVP (реализовано):**
- Поиск товаров с фильтрацией
- Получение детальной информации об объявлении
- CLI интерфейс
- Вывод в консоль (таблица) и JSON
- Anti-detection (user-agent, случайные задержки)
- Stealth режим браузера
- Ручное решение капчи (в видимом режиме)

✅ **Прокси (реализовано):**
- Поддержка HTTP/HTTPS/SOCKS4/SOCKS5 ✅
- Авторизация (username:password) ✅
- SOCKS5 auth через proxy-chain ✅
- 3 стратегии ротации: sequential/random/round-robin ✅
- Автоматическая ротация каждые N запросов ✅
- Отключение неработающих прокси (round-robin) ✅
- Загрузка из файла ✅

✅ **Пагинация (реализовано):**
- Итератор для поиска по всем страницам (`search-all`) ✅

✅ **MCP Server (реализовано):**
- MCP сервер для интеграции с Claude Desktop и opencode ✅
- 3 инструмента: avito_search, avito_get_details, avito_search_all ✅
- Автоматическое переиспользование браузера ✅
- См. [docs/MCP_SETUP.md](docs/MCP_SETUP.md) ✅

🚧 **В разработке:**
- Anti-captcha интеграция (anti-captcha.com API)
- Поддержка прокси в MCP сервере через переменные окружения

## Установка

```bash
pnpm install
```

Playwright browsers установятся автоматически при установке зависимостей.

## Использование

### CLI

**Поиск товаров:**

```bash
# Базовый поиск
pnpm dev search "Samsung SSD 2TB"

# С фильтрами
pnpm dev search "Samsung SSD 2TB" --price-max 15000 --sort price_asc

# Сохранить результаты в JSON
pnpm dev search "Samsung SSD" --price-max 15000 --output results.json

# Без headless режима (показать браузер)
pnpm dev search "Samsung SSD" --headless false

# С прокси
pnpm dev search "Samsung SSD" --price-max 15000 --proxy-file config/proxies.txt

# С прокси и ротацией
pnpm dev search "Samsung SSD" \
  --price-max 15000 \
  --proxy-file config/proxies.txt \
  --proxy-rotation round-robin \
  --proxy-rotate-every 10
```

**Получить детали объявления:**

```bash
# Вывод в консоль
pnpm dev details "https://www.avito.ru/item/12345678"

# Сохранить в JSON
pnpm dev details "https://www.avito.ru/item/12345678" --output item.json
```

**Поиск по всем страницам:**

```bash
pnpm dev search-all "Samsung SSD" --output all-results.json --price-max 15000
```

### Программный API

```typescript
import { AvitoScraper } from './src/core/scraper.js';

const scraper = new AvitoScraper({
  headless: true,
  timeout: 30000,
  delayMs: [1000, 3000],
});

// Поиск
const results = await scraper.search({
  query: 'Samsung SSD 2TB',
  priceMax: 15000,
  sort: 'price_asc',
});

console.log(results);

// Детали
const details = await scraper.getItemDetails('https://www.avito.ru/item/12345678');
console.log(details);

// Закрыть браузер
await scraper.close();
```

### MCP Server (Claude Desktop / opencode)

**Быстрая настройка:**

1. Собрать проект:
```bash
pnpm install && pnpm build
```

2. Добавить в `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "avito-scraper": {
      "command": "node",
      "args": ["C:\\Temp\\mcp-avito\\dist\\mcp\\server.js"],
      "env": {
        "CHROME_EXECUTABLE_PATH": "C:\\Temp\\mcp-avito\\chrome-win64\\chrome.exe"
      }
    }
  }
}
```

3. Перезапустить Claude Desktop

**Использование в Claude Desktop:**
```
Найди Samsung SSD до 15000 рублей на Avito
```

Claude автоматически вызовет `avito_search` и покажет результаты.

### MCP Server (opencode)

opencode использует проектный `opencode.json` (уже в репозитории):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "avito": {
      "type": "local",
      "command": ["node", "dist/mcp/server.js"],
      "enabled": true,
      "env": {
        "CHROME_EXECUTABLE_PATH": "C:\\_develop\\_neuro\\mcp-avito\\chrome-win64\\chrome.exe"
      }
    }
  }
}
```

Перед запуском соберите проект (`pnpm build`) и **перезапустите opencode** — конфиг читается при старте. После этого в opencode появятся инструменты `avito_search`, `avito_get_details`, `avito_search_all`.

📚 Полная инструкция: [docs/MCP_SETUP.md](docs/MCP_SETUP.md)

### Примеры

**Найти Samsung SSD до 15000₽:**

```bash
pnpm dev search "Samsung SSD 2TB M.2 server" \
  --price-max 15000 \
  --sort price_asc \
  --output ssd-results.json
```

**Мониторинг цен:**

```bash
# Сохранять результаты с датой
pnpm dev search "Samsung PM983" \
  --price-max 15000 \
  --output "output/ssd-$(date +%Y%m%d).json"
```

## Структура проекта

```
avito-scraper/
├── src/
│   ├── core/
│   │   ├── scraper.ts       # Основной scraper
│   │   ├── browser.ts       # Управление браузером
│   │   ├── parser.ts        # Парсинг HTML
│   │   └── types.ts         # TypeScript типы
│   ├── plugins/
│   │   └── output/
│   │       ├── console.ts   # Вывод в консоль
│   │       └── json.ts      # Сохранение в JSON
│   ├── utils/
│   │   ├── delays.ts        # Случайные задержки
│   │   ├── user-agents.ts   # User-agent pool
│   │   └── url-builder.ts   # Построение URL
│   └── cli.ts               # CLI интерфейс
├── config/
│   └── proxies.txt          # Список прокси (будущее)
├── opencode.json            # MCP-конфигурация для opencode
└── output/                  # Выходные файлы
```

## Опции

### ScraperOptions

```typescript
{
  headless?: boolean;         // Headless режим (default: true)
  timeout?: number;           // Таймаут запросов (default: 30000ms)
  retries?: number;           // Повторные попытки (default: 3)
  delayMs?: [number, number]; // Задержка [min, max] (default: [1000, 3000])
  userAgent?: string;         // Custom user-agent
  captchaTimeoutMs?: number;  // Сколько ждать ручного решения капчи (default: 120000ms)
  captchaPollMs?: number;     // Как часто проверять решена ли капча (default: 3000ms)
  manualCaptchaFallback?: boolean; // При капче в headless — перезапустить браузер в видимом режиме (default: true)
}
```

### SearchFilters

```typescript
{
  query: string;              // Поисковый запрос (обязательно)
  priceMin?: number;          // Минимальная цена
  priceMax?: number;          // Максимальная цена
  locationId?: number;        // ID региона
  page?: number;              // Номер страницы
  sort?: string;              // Сортировка: date | price_asc | price_desc
}
```

## Anti-detection

Scraper использует несколько техник для обхода детекции:

- ✅ Случайные user-agents
- ✅ Случайные задержки между запросами
- ✅ Stealth mode (скрытие webdriver)
- ✅ Реалистичные настройки браузера (viewport, locale, timezone)
- ✅ Прокси поддержка (HTTP/HTTPS/SOCKS4/SOCKS5 с авторизацией)
- ✅ Ротация прокси (3 стратегии)
- ✅ Ручное решение captcha (в non-headless режиме: попап в окне браузера + автопроверка)
- ✅ Автопереход в видимый режим при капче в headless (manualCaptchaFallback)
- 🚧 Решение captcha автоматическое (в планах)

## Roadmap

См. подробный план разработки в [docs/PLAN.md](docs/PLAN.md)

**Следующая версия (v1.1.0):**
- [x] MCP сервер для интеграции с Claude Desktop
- [x] MCP tools: avito_search, avito_get_details, avito_search_all
- [x] Конфигурация для Claude Desktop
- [x] Интеграция с opencode (проектный opencode.json)

**Будущие версии:**
- [ ] Anti-captcha.com API интеграция
- [ ] Web UI dashboard
- [ ] Мониторинг цен и уведомления
- [ ] CSV/Excel экспорт

## Troubleshooting

**Ошибка "Captcha detected":**
- В headless режиме при включённом `manualCaptchaFallback` (по умолчанию) браузер автоматически перезапустится в видимом окне — решите капчу там
- Запустите CLI с `--headless false` — в окне браузера появится попап с просьбой решить капчу вручную
- Уменьшите частоту запросов
- Используйте прокси
- Добавьте anti-captcha solver

**Пустые результаты:**
- Проверьте поисковый запрос
- Запустите с `--headless false` для визуальной проверки
- Проверьте селекторы в `parser.ts` (Avito может изменить HTML)

**Браузер не запускается:**
- Убедитесь что установлен Chromium: `npx playwright install chromium`

## Лицензия

MIT

## Disclaimer

Этот инструмент предназначен только для образовательных целей. Использование scraping'а может нарушать Terms of Service Avito. Используйте на свой риск.
