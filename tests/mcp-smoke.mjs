import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

if (!process.env.AVITO_CDP_URL) throw new Error('Set AVITO_CDP_URL before running the CDP smoke test');
const client = new Client({ name: 'avito-cdp-smoke', version: '1.0' });
await client.connect(new StdioClientTransport({
  command: 'node', args: ['dist/mcp/server.js'], env: process.env,
}));
try {
  const search = await client.callTool({ name: 'avito_search', arguments: { query: 'книга' } });
  const payload = JSON.parse(search.content.find(part => part.type === 'text').text);
  console.log(JSON.stringify({ tool: 'avito_search', success: payload.success, count: payload.count,
    code: payload.code, error: payload.error,
    first: payload.results?.[0] && { title: payload.results[0].title, price: payload.results[0].price, url: payload.results[0].url.split('?')[0] } }));
  if (!payload.results?.length) process.exitCode = 1;
  else {
    const details = await client.callTool({ name: 'avito_get_details', arguments: { url: payload.results[0].url } });
    const item = JSON.parse(details.content.find(part => part.type === 'text').text);
    console.log(JSON.stringify({ tool: 'avito_get_details', success: item.success, code: item.code,
      error: item.error, title: item.details?.title, price: item.details?.price,
      url: item.details?.url?.split('?')[0] }));
    if (!item.success || !item.details?.title) process.exitCode = 1;
  }
} finally {
  await client.close();
}
