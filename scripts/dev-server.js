const fs = require('fs');
const http = require('http');
const path = require('path');

const statusHandler = require('../api/vending/status');
const turnHandler = require('../api/vending/turn');

const port = Number(process.env.PORT || 3000);
const publicDir = path.resolve(__dirname, '../public/vending');
const maxBodyBytes = 16 * 1024;

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function decorateResponse(res) {
  res.status = code => {
    res.statusCode = code;
    return res;
  };
  res.json = payload => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
    return res;
  };
  return res;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        return;
      }
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(pathname, res) {
  const relative = pathname === '/' || pathname === '/vending' || pathname === '/vending/'
    ? 'index.html'
    : pathname.replace(/^\/vending\//, '');
  const file = path.resolve(publicDir, relative);

  if (!file.startsWith(`${publicDir}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  res.setHeader('Content-Type', mimeTypes[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, rawRes) => {
  const res = decorateResponse(rawRes);
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;

  try {
    if (pathname === '/api/vending/status') return statusHandler(req, res);
    if (pathname === '/api/vending/turn') {
      req.body = await readJsonBody(req);
      return turnHandler(req, res);
    }
    if (pathname === '/' || pathname === '/vending' || pathname.startsWith('/vending/')) {
      return serveStatic(pathname, res);
    }

    res.statusCode = 404;
    res.end('Not found');
  } catch (error) {
    if (res.writableEnded) return;
    res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
});

server.listen(port, () => {
  console.log(`Zai Vending Machine: http://localhost:${port}`);
});
