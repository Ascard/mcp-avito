const { spawn } = require('child_process');
const p = spawn('node', ['dist/mcp/server.js'], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
p.stdout.on('data', (d) => {
  buf += d.toString();
  const lines = buf.split('\n');
  buf = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.id === 1) console.log('init OK:', m.result.serverInfo.name, m.result.serverInfo.version);
    if (m.id === 2) {
      for (const t of m.result.tools) console.log('-', t.name, '::', t.description.slice(0, 70));
      p.kill();
      process.exit(0);
    }
  }
});
p.stderr.on('data', () => {});
p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1.0' } } }) + '\n');
p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
setTimeout(() => { console.error('TIMEOUT: server did not answer'); p.kill(); process.exit(1); }, 15000);
