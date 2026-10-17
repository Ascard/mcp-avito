# Shared Windows Chrome for Avito MCP and Hermes (CDP)

This is a self-hosted setup. The visible Windows Chrome process owns the browser profile. Hermes Browser Use connects directly to its loopback CDP port; Playwright in the existing `mcp-avito` WSL Container connects through an authenticated Windows-to-WSL-adapter TCP bridge. MCP uses its own tab in Chrome's default context. Neither client should use the other client's tab. No cloud browser or CAPTCHA service is involved.

## Installed layout (this machine)

- Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Dedicated profile: `%LOCALAPPDATA%\hermes\avito-chrome-profile` (outside Git)
- Windows CDP: `http://127.0.0.1:9222`; WSL bridge: `http://172.20.16.1:19222`
- Bridge script: `scripts/cdp-bridge.py` in this Windows checkout
- Bridge token: `%LOCALAPPDATA%\hermes\avito-cdp-bridge.token` and `/opt/avito/cdp-bridge.token` (never commit or print either)
- WSL Container `mcp-avito`: named volume `mcp-avito-data` mounted at `/opt/avito`, project `/opt/avito/repo`, Playwright 1.58.1, Chromium `/opt/avito/ms-playwright`, Node `/usr/bin/node`, pnpm `/usr/local/bin/pnpm`
- Windows Hermes v0.22.2 config: `%LOCALAPPDATA%\hermes\config.yaml` (baseline backup `config.yaml.pre-avito-cdp.bak`); pre-change container sources: `/opt/avito/cdp-backup/src/`

## Start after Windows reboot

Use a PowerShell terminal (adjust the checkout path if moved). Do not start Chrome with the default profile; Chrome 136+ ignores debugging flags for it. Keep the terminal running for the bridge, or launch it in a separate dedicated terminal. The bridge script binds only the WSL virtual adapter and relays to Chrome loopback; it rejects clients without the local bearer token, and strips that header before forwarding to Chrome.

```powershell
wslc start mcp-avito
$Chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$Profile = Join-Path $env:LOCALAPPDATA 'hermes\avito-chrome-profile'
Start-Process $Chrome -ArgumentList "--remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --user-data-dir=`"$Profile`" --no-first-run --no-default-browser-check about:blank"
Start-Process python -ArgumentList 'C:\Users\shameoff\Projects\mcp-avito\scripts\cdp-bridge.py'
curl.exe http://127.0.0.1:9222/json/version
# Expected: browser metadata and webSocketDebuggerUrl. Do not share that URL.
wslc exec mcp-avito sh -lc 'curl -s -o /dev/null -w "%{http_code}\n" http://172.20.16.1:19222/json/version'
# Expected: 403 without the token. This confirms the bridge is listening and requiring authentication.
hermes mcp test avito
```

The WSL adapter address may change on reboot. Check it with `Get-NetIPAddress -InterfaceAlias 'vEthernet (WSL (Hyper-V firewall))' -AddressFamily IPv4`. If it differs from `172.20.16.1`, start the bridge with `AVITO_BRIDGE_HOST` set to that *specific* adapter address (not `0.0.0.0`), and update `AVITO_CDP_URL` in the Hermes MCP args using `hermes config set` after backing up the config. Keep the dedicated profile free of unrelated sensitive accounts. The WSL Container bridge network source may be SNATed to the adapter IP, so IP-based filtering cannot isolate an individual container; possession of the token file is the access control. Do not move the token to Git or expose the virtual adapter externally.

Verify authenticated connectivity and shared context without dumping credentials:

```bash
wslc exec mcp-avito sh -lc 'cd /opt/avito/repo && AVITO_CDP_URL=http://172.20.16.1:19222 AVITO_CDP_TOKEN_FILE=/opt/avito/cdp-bridge.token pnpm test'
```

The built-in tests open only temporary local test tabs and close them. Never run a second Chrome process against the same user-data-dir.

## Hermes and MCP configuration

The existing Windows Hermes config has `browser.cdp_url: http://127.0.0.1:9222` and `browser.cloud_provider: local`. `browser_exec` (Browser Use mode) can attach to this Chrome process. In an interactive Hermes CLI, `/browser connect ws://...` is an alternative; for gateway/CLI tool sessions use `browser.cdp_url`, not a slash command sent in chat. Avoid setting `browser.use_real_profile`: that feature makes a *copy* rather than joining this process. Use different tabs sequentially; `browser_exec(session=...)` may otherwise create separate local browser sessions depending on backend, so verify Chrome's `/json/list` after attaching.

Hermes's stdio MCP entry calls `C:/Program Files/WSL/wslc.exe` with args:

```text
exec -i mcp-avito /usr/bin/env PLAYWRIGHT_BROWSERS_PATH=/opt/avito/ms-playwright AVITO_CDP_URL=http://172.20.16.1:19222 AVITO_CDP_TOKEN_FILE=/opt/avito/cdp-bridge.token node /opt/avito/repo/dist/mcp/server.js
```

The bearer token is read from the file by the MCP server, not included in the command line. The bridge strips it before passing CDP traffic to Chrome. `AVITO_CDP_URL` is optional: unset it to use Playwright's standalone Chromium; the bridge token file has no effect in standalone mode. Build deployed sources in the existing volume with `wslc exec mcp-avito sh -lc 'cd /opt/avito/repo && pnpm build'` before restarting Hermes MCP. Restart the Hermes session after changing MCP config because already-connected MCP subprocesses keep their old environment.

## Search, verification, and manual CAPTCHA

Open Avito using Hermes Browser Use or the Chrome window, then call `avito_search` with `{"query":"книга"}`. The MCP creates its own tab in the same default browser context and does not navigate Hermes's tab. Select a returned URL and call `avito_get_details` on it. For a small repeatable end-to-end probe (two requests, not a crawl):

```bash
wslc exec mcp-avito sh -lc 'cd /opt/avito/repo && AVITO_CDP_URL=http://172.20.16.1:19222 AVITO_CDP_TOKEN_FILE=/opt/avito/cdp-bridge.token node tests/mcp-smoke.mjs'
```

If a CAPTCHA is detected on the MCP tab, solve it *manually in the visible Chrome window*. CDP mode never restarts Chrome; the MCP waits up to 25 seconds to remain below common Hermes tool timeouts, then returns `CAPTCHA_DETECTED`. If that is insufficient, finish manually and retry the same tool; the browser and profile are retained. Never automate CAPTCHA solving. An IP restriction returns `ACCESS_BLOCKED` separately: a shared profile does not guarantee that Avito will grant access. `RESULTS_MISSING` means no expected listing DOM (or a loading timeout); `PARSING_FAILED` means visible listing elements could not be extracted. Check selectors against the current page DOM. An explicit Avito no-matches message returns an empty list. A lost connection is returned as a tool error; restart Chrome/bridge and retry once.

## Troubleshooting and recovery

- `connection refused` on `127.0.0.1:9222`: launch the dedicated Chrome profile above. Ensure a stale Chrome process is not holding that same profile. Do not delete the profile.
- 403 on bridge: expected without a token; with a token, check matching token-file contents *without printing them* and check `AVITO_CDP_TOKEN_FILE` exists inside the named volume. Do not disable authentication to diagnose it.
- `host.wslc.internal:9222` unreachable: expected for Chrome bound to Windows loopback; use the authenticated WSL adapter bridge. Never bind Chrome to `0.0.0.0`.
- Bridge connection refused: verify virtual-adapter address, local Windows firewall rules, bridge process, and the exact `AVITO_CDP_URL`. Do not change Windows global security settings.
- Chrome closes: leave MCP running; relaunch Chrome with the same profile, then retry the MCP call. It reconnects when it sees a disconnected browser. A failed in-flight request is not replayed automatically.
- MCP tab closes: next call creates a new MCP-owned tab. Browser Use's tab is unaffected.
- Hermes restarts: keep Chrome and bridge running; Hermes reattaches using `browser.cdp_url`, MCP reconnects at the next session startup. Run `hermes mcp test avito` to check discovery.
- `wslc restart mcp-avito`: preserves `mcp-avito-data`; check that the bridge IP and token still match, then retry. Do not recreate the volume.
- Standalone Chromium mode: unset `AVITO_CDP_URL` in the Hermes MCP args, rebuild/restart the MCP process. The old headless behavior creates and owns a separate Chromium context; it does not share Chrome's cookies. This was tested successfully with Playwright's headless shell. A headed full-Chrome launch currently fails with missing `libcups.so.2` in this container; install the OS dependency before using headed standalone mode.

## Rollback

The original config is backed up at `%LOCALAPPDATA%\hermes\config.yaml.pre-avito-cdp.bak`; do not overwrite a subsequently updated config wholesale. Instead, use `hermes config set browser.cdp_url ''` and restore the original `mcp_servers.avito.args` from that backup through `hermes config set`. Original container source files are in `/opt/avito/cdp-backup/src/` for a targeted restore; preserve the volume. Stop the bridge and close only the dedicated Chrome process when finished. The profile may be left on disk for future sessions; never commit it.
