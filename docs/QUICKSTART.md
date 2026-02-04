# Быстрый старт

## 1️⃣ Установка

```bash
cd C:\Temp\mcp-avito
pnpm install
pnpm build
```

## 2️⃣ Настройка прокси (опционально)

Создайте файл `config/proxies-local.txt`:

```
socks5://10.1.10.2:1080
socks5://10.1.10.2:1081
```

Или с авторизацией:

```
socks5://username:password@proxy.example.com:1080
http://username:password@proxy.example.com:8080
```

## 3️⃣ Первый запуск

### Без прокси:

```bash
node dist/cli.js search "Samsung SSD" --page 1
```

### С прокси:

```bash
node dist/cli.js search "Samsung SSD" \
  --page 1 \
  --proxy-file config/proxies-local.txt
```

## 4️⃣ Сохранение результатов

```bash
node dist/cli.js search "Samsung M.2 SSD" \
  --price-min 10000 \
  --price-max 20000 \
  --output results.json \
  --proxy-file config/proxies-local.txt
```

## 5️⃣ Детали товара

```bash
node dist/cli.js details "https://www.avito.ru/moskva/tovary_dlya_kompyutera/..." \
  --output item-details.json
```

## 6️⃣ Поиск по всем страницам

```bash
node dist/cli.js search-all "iPhone 13" \
  --price-max 50000 \
  --output all-iphones.json \
  --proxy-file config/proxies-local.txt \
  --proxy-rotation round-robin
```

---

## 📚 Дальше

- Полное руководство: [USAGE.md](./USAGE.md)
- План развития: [PLAN.md](./PLAN.md)
- Основное README: [../README.md](../README.md)

---

## ⚠️ Важно

**Прокси:** Датацентр прокси блокируются Avito. Используйте:
- Резидентные прокси
- Локальные SOCKS5 туннели (SSH, VPN)
- Или работайте без прокси (риск бана IP)

**Лимиты:** Рекомендуется задержка 1-3 секунды между запросами (настраивается автоматически).

**Капча:** При появлении капчи в headless режиме - запустите с `--headless false` для ручного решения.
