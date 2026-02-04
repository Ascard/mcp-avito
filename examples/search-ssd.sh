#!/bin/bash
# Example: Search for Samsung SSD under 15000 RUB

pnpm dev search "Samsung SSD 2TB M.2 server" \
  --price-max 15000 \
  --sort price_asc \
  --output output/ssd-results.json
