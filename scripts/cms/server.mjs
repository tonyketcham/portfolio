import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// This companion never runs from `next start`, and refuses production explicitly.
if (process.env.NODE_ENV === 'production') {
  console.error('The copy CMS is development-only.');
  process.exit(1);
}
const { catalog } = await import('./catalog.mjs');
const { repository } = await import('./repository.mjs');
const root = fileURLToPath(new URL('../../', import.meta.url));
const repo = repository(root);
const token = randomBytes(32).toString('hex');
const port = Number(process.env.CMS_PORT ?? 4318);
const appPort = Number(process.env.PORT ?? 3000);
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
function localUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && localHosts.has(url.hostname) && [port, appPort].includes(Number(url.port || 80));
  } catch { return false; }
}
const clientPath = path.join(root, 'scripts/cms');
const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const json = (code, data) => { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); };
  try {
    if (!localUrl(`http://${request.headers.host}`)) return json(403, { error: 'The CMS is available only on localhost.' });
    const url = new URL(request.url, `http://${request.headers.host}`);
    const resource = url.pathname.replace(/^\/cms(?=\/|$)/, '') || '/';
    if (request.method === 'GET' && ['/', '/client.js', '/style.css'].includes(resource)) {
      const filename = resource === '/' ? 'index.html' : resource.slice(1);
      const types = { 'index.html': 'text/html; charset=utf-8', 'client.js': 'text/javascript; charset=utf-8', 'style.css': 'text/css; charset=utf-8' };
      let body = await readFile(path.join(clientPath, filename), 'utf8');
      if (filename === 'index.html') body = body.replace('__TOKEN__', token).replace('__EXPERIENCE__', `http://localhost:${appPort}`);
      response.writeHead(200, { 'Content-Type': types[filename] });
      return response.end(body);
    }
    if (request.headers['x-cms-token'] !== token) return json(403, { error: 'Reload the local CMS to reconnect.' });
    if (request.method === 'GET' && resource === '/api/catalog') {
      const records = await catalog(root);
      return json(200, { records: records.map(({ file, hash, fields }) => ({ file, hash, fields: fields.map(({ raw, start, end, ...field }) => field) })), status: await repo.status(), ...await repo.copyState() });
    }
    if (request.method === 'GET' && resource === '/api/status') return json(200, await repo.status());
    if (request.method !== 'POST' || !['/api/save', '/api/save-copy', '/api/push'].includes(resource)) return json(404, { error: 'Not found.' });
    if (!localUrl(request.headers.origin)) return json(403, { error: 'Open the CMS from its local URL before saving.' });
    if (!request.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Expected JSON.' });
    let body = '', size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 1024 * 1024) return json(413, { error: 'Too many changes for a single save.' });
      body += chunk;
    }
    const data = JSON.parse(body);
    return json(200, resource === '/api/save' ? await repo.save(data) : resource === '/api/save-copy' ? await repo.saveCopy(data) : await repo.push(data));
  } catch (error) { json(400, { error: error.message }); }
});
server.listen(port, '127.0.0.1', () => console.log(`Copy CMS: http://127.0.0.1:${port}/cms/ (development only)`));
server.on('error', (error) => { console.error(`CMS could not start: ${error.message}`); process.exit(1); });
