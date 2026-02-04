# Proxy Setup Guide

## Overview

The scraper supports proxy rotation to avoid IP bans and distribute load. Multiple protocols and rotation strategies are supported.

## Supported Proxy Types

- **HTTP**: `http://host:port`
- **HTTPS**: `https://host:port`
- **SOCKS4**: `socks4://host:port`
- **SOCKS5**: `socks5://host:port`

## Authentication

Proxies with username/password authentication are supported:

```
socks5://username:password@host:port
http://user:pass@proxy.example.com:8080
```

## Proxy File Format

Create a text file (e.g., `config/proxies.txt`) with one proxy per line:

```
# Comments start with #
socks5://YBY46AQS:rWPJiK6z@45.93.15.6:64869
http://proxy1.example.com:8080
https://secure-proxy.example.com:443

# Blank lines are ignored
socks4://192.168.1.100:1080
```

## Rotation Strategies

### 1. Sequential (Default)
Cycles through proxies one by one:
```
proxy1 → proxy2 → proxy3 → proxy1 ...
```

**Usage:**
```bash
pnpm dev search "SSD" --proxy-file config/proxies.txt --proxy-rotation sequential
```

### 2. Random
Selects a random proxy for each request:

**Usage:**
```bash
pnpm dev search "SSD" --proxy-file config/proxies.txt --proxy-rotation random
```

### 3. Round-Robin
Distributes load evenly and tracks success rates. Automatically disables failing proxies temporarily.

**Features:**
- Tracks success/failure rates
- Temporarily disables proxies after 3 consecutive failures
- Re-enables after 5-minute cooldown

**Usage:**
```bash
pnpm dev search "SSD" --proxy-file config/proxies.txt --proxy-rotation round-robin
```

## Auto-Rotation

Automatically rotate proxy every N requests:

```bash
pnpm dev search "SSD" \
  --proxy-file config/proxies.txt \
  --proxy-rotate-every 10
```

This rotates proxy every 10 requests.

## CLI Examples

### Basic proxy usage:
```bash
pnpm dev search "Samsung SSD 2TB" \
  --price-max 15000 \
  --proxy-file config/proxies.txt
```

### With specific rotation strategy:
```bash
pnpm dev search "Samsung SSD 2TB" \
  --price-max 15000 \
  --proxy-file config/proxies.txt \
  --proxy-rotation round-robin
```

### Auto-rotate every 5 requests:
```bash
pnpm dev search-all "Samsung SSD" \
  --output results.json \
  --proxy-file config/proxies.txt \
  --proxy-rotate-every 5
```

## Programmatic Usage

```typescript
import { AvitoScraper } from './src/core/scraper.js';

const scraper = new AvitoScraper({
  headless: true,
  proxy: {
    enabled: true,
    listFile: './config/proxies.txt',
    rotation: 'round-robin',
    rotateOnError: true,
    rotateEveryN: 10,
  },
});

const results = await scraper.search({
  query: 'Samsung SSD 2TB',
  priceMax: 15000,
});
```

## Environment Variables

Configure proxy settings in `.env`:

```env
PROXY_ENABLED=true
PROXY_LIST_FILE=./config/proxies.txt
PROXY_ROTATION=round-robin
PROXY_ROTATE_ON_ERROR=true
PROXY_ROTATE_EVERY_N=10
```

## Troubleshooting

### Proxy connection errors

If you see `Proxy connection ended before receiving CONNECT response`:
- Check proxy credentials
- Verify proxy is online and accessible
- Try a different proxy type (e.g., SOCKS5 instead of HTTP)

### All proxies marked as failed

Round-robin strategy temporarily disables failing proxies. Wait 5 minutes for cooldown or:
```typescript
// Reset failed proxy status
scraper.resetProxyStats();
```

### Slow performance with proxies

- Use faster proxies (test ping/latency)
- Reduce `--proxy-rotate-every` value
- Use `random` strategy for better distribution

## Best Practices

1. **Test proxies first** - Verify proxies work before adding to list
2. **Mix proxy types** - Use both SOCKS5 and HTTP for redundancy
3. **Monitor success rates** - Round-robin shows stats in logs
4. **Rotate frequently** - Avito may detect patterns
5. **Use residential proxies** - Better than datacenter IPs for avoiding bans

## Getting Proxies

Popular proxy providers:
- **Residential**: Bright Data, Smartproxy, Oxylabs
- **Datacenter**: ProxyRack, MyPrivateProxy, InstantProxies
- **Free**: ProxyScrape, FreeProxyList (not recommended for production)

## Security Notes

- Never commit `config/proxies.txt` to git (it's in .gitignore)
- Rotate proxy credentials regularly
- Use environment variables for sensitive data
- Monitor proxy usage for suspicious activity
