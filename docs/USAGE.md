# Avito Scraper - Руководство пользователя

## Установка

```bash
# Клонировать проект
cd C:\Temp\mcp-avito

# Установить зависимости
pnpm install

# Собрать проект
pnpm build

# (Опционально) Установить глобально
npm link
```

## Быстрый старт

### 1. Простой поиск

```bash
node dist/cli.js search "Samsung SSD"
```

### 2. Поиск с фильтрами

```bash
node dist/cli.js search "iPhone 13" \
  --price-min 30000 \
  --price-max 50000 \
  --page 1
```

### 3. Сохранение в JSON

```bash
node dist/cli.js search "Ноутбук" \
  --output results.json
```

### 4. Детали товара

```bash
node dist/cli.js details "https://www.avito.ru/moskva/tovary_dlya_kompyutera/ssd_samsung_..." \
  --output item.json
```

### 5. Поиск по всем страницам

```bash
node dist/cli.js search-all "MacBook" \
  --output all-macbooks.json \
  --price-max 100000
```

---

## Использование с прокси

### Формат файла прокси

Создайте файл `config/proxies.txt`:

```
# Без авторизации
socks5://10.1.10.2:1080
socks5://10.1.10.2:1081

# С авторизацией
socks5://user:pass@45.93.15.6:64869
http://user:pass@proxy.example.com:8080
https://user:pass@proxy.example.com:8443
```

### Команды с прокси

```bash
# Простой поиск
node dist/cli.js search "Samsung" \
  --proxy-file config/proxies.txt

# С ротацией (sequential - по умолчанию)
node dist/cli.js search "Samsung" \
  --proxy-file config/proxies.txt \
  --proxy-rotation sequential

# Случайная ротация
node dist/cli.js search "Samsung" \
  --proxy-file config/proxies.txt \
  --proxy-rotation random

# Round-robin с метриками
node dist/cli.js search "Samsung" \
  --proxy-file config/proxies.txt \
  --proxy-rotation round-robin

# Ротация каждые N запросов
node dist/cli.js search "Samsung" \
  --proxy-file config/proxies.txt \
  --proxy-rotate-every 5
```

---

## CLI опции

### Команда `search`

```
Usage: avito-scraper search [options] <query>

Опции:
  --price-min <number>           Минимальная цена
  --price-max <number>           Максимальная цена
  --location <id>                ID локации
  --page <number>                Номер страницы (по умолчанию: 1)
  --sort <type>                  Сортировка: date|price_asc|price_desc (по умолчанию: "default")
  --output <file>                Сохранить в JSON файл
  --headless <boolean>           Режим headless (по умолчанию: true)
  --proxy-file <file>            Путь к файлу с прокси
  --proxy-rotation <strategy>    Стратегия ротации: sequential|random|round-robin
  --proxy-rotate-every <number>  Ротация каждые N запросов
```

### Команда `details`

```
Usage: avito-scraper details [options] <url>

Опции:
  --output <file>                Сохранить в JSON файл
  --headless <boolean>           Режим headless (по умолчанию: true)
  --proxy-file <file>            Путь к файлу с прокси
  --proxy-rotation <strategy>    Стратегия ротации
```

### Команда `search-all`

```
Usage: avito-scraper search-all [options] <query>

Опции:
  --output <file>                Выходной JSON файл (обязательно)
  --price-min <number>           Минимальная цена
  --price-max <number>           Максимальная цена
  --location <id>                ID локации
  --sort <type>                  Сортировка
  --headless <boolean>           Режим headless (по умолчанию: true)
  --proxy-file <file>            Путь к файлу с прокси
  --proxy-rotation <strategy>    Стратегия ротации
  --proxy-rotate-every <number>  Ротация каждые N запросов
```

---

## Программное использование

### TypeScript/JavaScript API

```typescript
import { AvitoScraper } from './core/scraper.js';

// Создать скрейпер
const scraper = new AvitoScraper({
  headless: true,
  timeout: 30000,
  delayMs: [1000, 3000],
  proxy: {
    enabled: true,
    listFile: 'config/proxies.txt',
    rotation: 'round-robin',
    rotateEveryN: 5,
    rotateOnError: true,
  },
});

// Поиск
const results = await scraper.search({
  query: 'Samsung SSD',
  priceMin: 5000,
  priceMax: 15000,
  page: 1,
});

console.log(`Найдено: ${results.length} товаров`);

// Детали товара
const details = await scraper.getItemDetails('https://www.avito.ru/...');
console.log(details);

// Поиск по всем страницам (generator)
for await (const item of scraper.searchAllPages({ query: 'MacBook' })) {
  console.log(item.title, item.price);
}

// Закрыть браузер
await scraper.close();
```

---

## Переменные окружения

Создайте файл `.env`:

```env
# Путь к Chrome (опционально)
CHROME_EXECUTABLE_PATH=./chrome-win64/chrome.exe

# Настройки прокси (опционально)
PROXY_LIST_FILE=config/proxies.txt
PROXY_ROTATION=round-robin
```

---

## Решение капчи

### Автоматически (non-headless режим)

Если встречается капча в видимом браузере:

1. Скрейпер автоматически остановится
2. Покажет сообщение: "⚠️  Captcha detected! Please solve it..."
3. Ждёт 60 секунд для ручного решения
4. Продолжает работу после решения

```bash
# Запустить с видимым браузером
node dist/cli.js search "Samsung" --headless false
```

### В будущем

Планируется интеграция с anti-captcha.com для автоматического решения.

---

## Формат JSON результатов

### Результаты поиска

```json
{
  "timestamp": "2026-02-04T15:55:54.836Z",
  "count": 50,
  "results": [
    {
      "id": "7787355738",
      "title": "SSD m2 Samsung - 256gb",
      "price": 2600,
      "currency": "RUB",
      "location": "Москва",
      "url": "https://www.avito.ru/...",
      "imageUrl": "https://90.img.avito.st/...",
      "description": "",
      "publishedAt": "2 часа назад"
    }
  ]
}
```

### Детали товара

```json
{
  "id": "7787355738",
  "title": "SSD m2 Samsung - 256gb",
  "price": 2600,
  "currency": "RUB",
  "description": "Полное описание товара...",
  "seller": {
    "name": "Иван И.",
    "rating": 4.9,
    "reviewsCount": 150
  },
  "location": "Москва, м. Тверская",
  "publishedAt": "2026-02-04",
  "views": 245,
  "images": [
    "https://90.img.avito.st/...",
    "https://91.img.avito.st/..."
  ],
  "parameters": {
    "Состояние": "Б/у",
    "Тип": "SSD накопитель"
  }
}
```

---

## Troubleshooting

### Проблема: ERR_TUNNEL_CONNECTION_FAILED

**Причина:** Avito блокирует ваш прокси IP

**Решение:**
1. Используйте резидентные прокси вместо датацентр прокси
2. Попробуйте другой прокси провайдер
3. Или работайте без прокси (риск бана IP)

### Проблема: Browser not found

**Причина:** Playwright Chrome не установлен

**Решение:**
```bash
pnpm install
# или
npx playwright install chromium
```

### Проблема: Captcha detected (в headless режиме)

**Причина:** Avito показывает капчу

**Решение:**
1. Запустите в non-headless режиме: `--headless false`
2. Или используйте лучшие прокси
3. Или добавьте больше задержек между запросами

### Проблема: No results found

**Причина:** Страница не загрузилась или изменилась структура Avito

**Решение:**
1. Проверьте интернет соединение
2. Попробуйте без прокси
3. Обновите селекторы в `src/core/parser.ts`

---

## Примеры использования

### Пример 1: Мониторинг цен

```bash
# Ищем MacBook и сохраняем цены
node dist/cli.js search "MacBook Pro 14" \
  --output prices-$(date +%Y%m%d).json \
  --proxy-file config/proxies.txt
```

### Пример 2: Поиск с несколькими фильтрами

```bash
# Ищем серверные SSD в диапазоне цен
node dist/cli.js search "Samsung M.2 SSD server" \
  --price-min 10000 \
  --price-max 20000 \
  --sort price_asc \
  --output server-ssd.json
```

### Пример 3: Массовый сбор данных

```bash
# Собираем все страницы
node dist/cli.js search-all "iPhone 13" \
  --price-max 50000 \
  --output all-iphones.json \
  --proxy-file config/proxies.txt \
  --proxy-rotation round-robin
```

---

## Лимиты и ограничения

- **Скорость:** Рекомендуется задержка 1-3 секунды между запросами
- **Прокси:** Датацентр прокси блокируются Avito, используйте резидентные
- **Капча:** Может появиться при интенсивном использовании
- **Результаты на странице:** Максимум 50 элементов
- **Timeout:** По умолчанию 30 секунд на загрузку страницы

---

## Безопасность

⚠️ **Важно:**

- Не коммитьте файлы с прокси в git
- Добавьте `config/proxies.txt` в `.gitignore`
- Не используйте личный IP без прокси для массового сбора
- Соблюдайте robots.txt и Terms of Service Avito

---

_Для получения поддержки см. [PLAN.md](./PLAN.md) и [README.md](../README.md)_
