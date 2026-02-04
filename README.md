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

🚧 **В разработке:**
- MCP сервер для интеграции с Claude Desktop
- Anti-captcha интеграция (anti-captcha.com API)

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
- 🚧 Решение captcha (ручное в non-headless режиме, автоматическое - в планах)

## Roadmap

См. подробный план разработки в [docs/PLAN.md](docs/PLAN.md)

**Следующая версия (v1.1.0):**
- [ ] MCP сервер для интеграции с Claude Desktop
- [ ] MCP tools: avito_search, avito_get_details, avito_search_all
- [ ] Конфигурация для Claude Desktop

**Будущие версии:**
- [ ] Anti-captcha.com API интеграция
- [ ] Web UI dashboard
- [ ] Мониторинг цен и уведомления
- [ ] CSV/Excel экспорт

## Troubleshooting

**Ошибка "Captcha detected":**
- Уменьшите частоту запросов
- Используйте прокси (когда будет реализовано)
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
