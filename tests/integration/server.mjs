#!/usr/bin/env node
/** Minimal static server for the e2e fixture pages (127.0.0.1 only). */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve('tests/fixtures/e2e');
const port = Number(process.env.PORT ?? 4178);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const path = normalize(join(root, url.pathname === '/' ? 'app.html' : url.pathname));
  if (!path.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(path);
    response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/html' }).end('<h1>Not found</h1>');
  }
}).listen(port, '127.0.0.1', () => console.log(`Fixture server on http://127.0.0.1:${port}`));
