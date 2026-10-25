const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = __dirname;
const dataDirectory = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const dataFile = path.join(dataDirectory, 'records.json');
const maxBodyBytes = 16 * 1024;
const sessionLifetimeMs = 12 * 60 * 60 * 1000;
const adminPassword = process.env.ADMIN_PASSWORD || '';
const adminSalt = crypto.randomBytes(16);
const adminPasswordHash = adminPassword
  ? crypto.scryptSync(adminPassword, adminSalt, 64)
  : null;
const sessions = new Map();
const loginAttempts = new Map();
const products = {
  'amethyst-rose-quartz': { name: 'Amethyst and Rose Quartz Crystals', price: 1499 },
  'healing-stones': { name: 'Healing Stones Set', price: 1299 },
  'agarbatti-dhoop': { name: 'Agarbatti and Dhoop', price: 699 },
  'rudraksha-mala': { name: 'Rudraksha Mala', price: 1999 },
  'vastu-kit': { name: 'Vastu Product Set', price: 2499 }
};
const services = new Set([
  'Home Vastu',
  'Office Vastu',
  'Business Vastu',
  'Astrology',
  'Energy Guidance'
]);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

if (adminPassword && adminPassword.length < 14) {
  throw new Error('ADMIN_PASSWORD must be at least 14 characters long.');
}

let records = { consultations: [], messages: [], orders: [] };
let writeQueue = Promise.resolve();

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

function getClientAddress(request) {
  return request.socket.remoteAddress || 'unknown';
}

function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;

  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let byteLength = 0;
    let tooLarge = false;

    request.on('data', (chunk) => {
      if (tooLarge) return;
      byteLength += chunk.length;
      if (byteLength > maxBodyBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        return;
      }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw new Error('Expected a JSON object.');
        }
        resolve(body);
      } catch {
        reject(Object.assign(new Error('Send valid JSON data.'), { statusCode: 400 }));
      }
    });

    request.on('error', reject);
  });
}

function stringField(body, field, label, maxLength, required = true) {
  const value = body[field];
  if (typeof value !== 'string') {
    if (!required && value === undefined) return '';
    throw Object.assign(new Error(`${label} is required.`), { statusCode: 400 });
  }

  const trimmed = value.trim();
  if ((!trimmed && required) || trimmed.length > maxLength) {
    throw Object.assign(
      new Error(trimmed ? `${label} must be ${maxLength} characters or fewer.` : `${label} is required.`),
      { statusCode: 400 }
    );
  }
  return trimmed;
}

function validatePhone(phone) {
  if (!/^[+\d][\d\s().-]{6,19}$/.test(phone)) {
    throw Object.assign(new Error('Enter a valid phone number.'), { statusCode: 400 });
  }
}

function saveRecord(collection, record) {
  const operation = writeQueue.then(async () => {
    records[collection].push(record);
    const temporaryFile = path.join(dataDirectory, `records-${process.pid}-${crypto.randomUUID()}.tmp`);
    try {
      await fs.promises.writeFile(temporaryFile, JSON.stringify(records, null, 2), { mode: 0o600 });
      await fs.promises.rename(temporaryFile, dataFile);
    } catch (error) {
      records[collection].pop();
      await fs.promises.rm(temporaryFile, { force: true }).catch((cleanupError) => {
        console.error('Could not remove temporary data file:', cleanupError);
      });
      throw error;
    }
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

function updateRecordStatus(collection, id, status) {
  const operation = writeQueue.then(async () => {
    const record = records[collection].find((entry) => entry.id === id);
    if (!record) {
      throw Object.assign(new Error('Record not found.'), { statusCode: 404 });
    }

    const previousStatus = record.status;
    record.status = status;
    const temporaryFile = path.join(dataDirectory, `records-${process.pid}-${crypto.randomUUID()}.tmp`);
    try {
      await fs.promises.writeFile(temporaryFile, JSON.stringify(records, null, 2), { mode: 0o600 });
      await fs.promises.rename(temporaryFile, dataFile);
    } catch (error) {
      record.status = previousStatus;
      await fs.promises.rm(temporaryFile, { force: true }).catch((cleanupError) => {
        console.error('Could not remove temporary data file:', cleanupError);
      });
      throw error;
    }
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

function checkSubmissionRate(request) {
  const key = `submission:${getClientAddress(request)}`;
  const now = Date.now();
  const attempts = loginAttempts.get(key);
  if (attempts && now - attempts.startedAt < 60 * 60 * 1000 && attempts.count >= 30) {
    throw Object.assign(new Error('Too many requests. Please try again later.'), { statusCode: 429 });
  }
  if (!attempts || now - attempts.startedAt >= 60 * 60 * 1000) {
    loginAttempts.set(key, { count: 1, startedAt: now });
  } else {
    attempts.count += 1;
  }
}

function getSession(request) {
  const cookies = request.headers.cookie || '';
  const token = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('pooja_admin='))
    ?.slice('pooja_admin='.length);
  if (!token) return null;

  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return token;
}

function setSessionCookie(response, token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `pooja_admin=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`
  );
}

function validateLogin(request, response, body) {
  if (!adminPasswordHash) {
    sendError(response, 503, 'Admin login is not configured. Set ADMIN_PASSWORD and restart the server.');
    return;
  }

  const key = `login:${getClientAddress(request)}`;
  const now = Date.now();
  const attempt = loginAttempts.get(key);
  if (attempt?.lockedUntil > now) {
    sendError(response, 429, 'Too many failed sign-in attempts. Try again later.');
    return;
  }

  const suppliedPassword = typeof body.password === 'string' ? body.password : '';
  const suppliedHash = crypto.scryptSync(suppliedPassword, adminSalt, 64);
  const valid = crypto.timingSafeEqual(suppliedHash, adminPasswordHash);
  if (!valid) {
    const current = attempt && attempt.startedAt > now - 15 * 60 * 1000
      ? attempt
      : { count: 0, startedAt: now };
    current.count += 1;
    if (current.count >= 5) current.lockedUntil = now + 15 * 60 * 1000;
    loginAttempts.set(key, current);
    sendError(response, 401, 'Incorrect admin password.');
    return;
  }

  loginAttempts.delete(key);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + sessionLifetimeMs;
  sessions.set(token, { expiresAt });
  setSessionCookie(response, token, Math.floor(sessionLifetimeMs / 1000));
  sendJson(response, 200, { success: true });
}

async function handleApi(request, response, pathname) {
  if (request.method !== 'POST' && request.method !== 'GET') {
    sendError(response, 405, 'Method not allowed.');
    return;
  }

  if (request.method === 'POST' && !isSameOrigin(request)) {
    sendError(response, 403, 'Cross-origin requests are not allowed.');
    return;
  }

  if (pathname === '/api/consultations' && request.method === 'POST') {
    checkSubmissionRate(request);
    const body = await readJsonBody(request);
    const name = stringField(body, 'name', 'Name', 100);
    const phone = stringField(body, 'phone', 'Phone number', 30);
    const service = stringField(body, 'service', 'Service', 60);
    const message = stringField(body, 'message', 'Query', 2000);
    validatePhone(phone);
    if (!services.has(service)) {
      sendError(response, 400, 'Select a valid consultation service.');
      return;
    }

    await saveRecord('consultations', {
      id: crypto.randomUUID(),
      name,
      phone,
      service,
      message,
      status: 'new',
      createdAt: new Date().toISOString()
    });
    sendJson(response, 201, { success: true, message: 'Your consultation request has been received.' });
    return;
  }

  if (pathname === '/api/contact' && request.method === 'POST') {
    checkSubmissionRate(request);
    const body = await readJsonBody(request);
    const name = stringField(body, 'name', 'Name', 100);
    const email = stringField(body, 'email', 'Email', 254).toLowerCase();
    const message = stringField(body, 'message', 'Message', 3000);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendError(response, 400, 'Enter a valid email address.');
      return;
    }

    await saveRecord('messages', {
      id: crypto.randomUUID(),
      name,
      email,
      message,
      status: 'new',
      createdAt: new Date().toISOString()
    });
    sendJson(response, 201, { success: true, message: 'Your message has been received.' });
    return;
  }

  if (pathname === '/api/orders' && request.method === 'POST') {
    checkSubmissionRate(request);
    const body = await readJsonBody(request);
    const name = stringField(body, 'name', 'Name', 100);
    const phone = stringField(body, 'phone', 'Phone number', 30);
    const address = stringField(body, 'address', 'Delivery address', 500);
    validatePhone(phone);
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
      sendError(response, 400, 'Your cart must contain between 1 and 20 products.');
      return;
    }

    const quantities = new Map();
    for (const item of body.items) {
      if (!item || typeof item.id !== 'string' || !Number.isInteger(item.quantity) ||
        item.quantity < 1 || item.quantity > 99 || !products[item.id]) {
        sendError(response, 400, 'Your cart contains an invalid product or quantity.');
        return;
      }
      const quantity = (quantities.get(item.id) || 0) + item.quantity;
      if (quantity > 99) {
        sendError(response, 400, 'A product quantity cannot exceed 99.');
        return;
      }
      quantities.set(item.id, quantity);
    }

    const orderItems = [...quantities].map(([id, quantity]) => ({
      id,
      name: products[id].name,
      price: products[id].price,
      quantity
    }));
    const total = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    await saveRecord('orders', {
      id: crypto.randomUUID(),
      name,
      phone,
      address,
      items: orderItems,
      total,
      status: 'pending',
      paymentStatus: 'unpaid',
      createdAt: new Date().toISOString()
    });
    sendJson(response, 201, {
      success: true,
      message: 'Your order request has been received. Payment is not collected online.',
      orderTotal: total
    });
    return;
  }

  if (pathname === '/api/admin/login' && request.method === 'POST') {
    const body = await readJsonBody(request);
    validateLogin(request, response, body);
    return;
  }

  if (pathname === '/api/admin/logout' && request.method === 'POST') {
    const token = getSession(request);
    if (token) sessions.delete(token);
    setSessionCookie(response, '', 0);
    sendJson(response, 200, { success: true });
    return;
  }

  if (pathname === '/api/admin/records' && request.method === 'GET') {
    if (!getSession(request)) {
      sendError(response, 401, 'Sign in to view admin records.');
      return;
    }
    sendJson(response, 200, records);
    return;
  }

  const statusRoute = pathname.match(/^\/api\/admin\/records\/(consultations|messages|orders)\/([0-9a-f-]+)\/status$/);
  if (statusRoute && request.method === 'POST') {
    if (!getSession(request)) {
      sendError(response, 401, 'Sign in to update records.');
      return;
    }
    const [, collection, id] = statusRoute;
    const body = await readJsonBody(request);
    const allowedStatuses = {
      consultations: new Set(['new', 'contacted', 'completed']),
      messages: new Set(['new', 'replied', 'closed']),
      orders: new Set(['pending', 'confirmed', 'fulfilled', 'cancelled'])
    };
    if (typeof body.status !== 'string' || !allowedStatuses[collection].has(body.status)) {
      sendError(response, 400, 'Choose a valid status.');
      return;
    }
    await updateRecordStatus(collection, id, body.status);
    sendJson(response, 200, { success: true });
    return;
  }

  sendError(response, 404, 'API endpoint not found.');
}

function serveStatic(request, response, pathname) {
  const requestedPath = pathname === '/admin' ? '/admin.html' : pathname;
  const filePath = path.resolve(root, `.${requestedPath}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  if (filePath === dataDirectory || filePath.startsWith(`${dataDirectory}${path.sep}`) ||
    path.basename(filePath).startsWith('.')) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    const targetPath = stats.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    fs.stat(targetPath, (targetError, targetStats) => {
      if (targetError || !targetStats.isFile()) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      response.writeHead(200, {
        'Content-Length': targetStats.size,
        'Content-Type': mimeTypes[path.extname(targetPath)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff'
      });

      if (request.method === 'HEAD') {
        response.end();
        return;
      }

      const stream = fs.createReadStream(targetPath);
      stream.on('error', (error) => {
        console.error(`Failed to read ${targetPath}:`, error);
        if (!response.headersSent) {
          response.writeHead(500);
          response.end('Internal server error');
        } else {
          response.destroy(error);
        }
      });
      stream.pipe(response);
    });
  });
}

async function startServer() {
  try {
    const savedData = await fs.promises.readFile(dataFile, 'utf8');
    const parsedData = JSON.parse(savedData);
    if (!parsedData || !Array.isArray(parsedData.consultations) ||
      !Array.isArray(parsedData.messages) || !Array.isArray(parsedData.orders)) {
      throw new Error('Stored records have an invalid structure.');
    }
    records = parsedData;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.promises.mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  }

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(token);
    }
    for (const [key, attempt] of loginAttempts) {
      if (now - Math.max(attempt.startedAt || 0, attempt.lockedUntil || 0) > 60 * 60 * 1000) {
        loginAttempts.delete(key);
      }
    }
  }, 30 * 60 * 1000);
  cleanupTimer.unref();

  const server = http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400);
      response.end('Bad request');
      return;
    }

    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/health' && request.method === 'GET') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }

      handleApi(request, response, pathname).catch((error) => {
        console.error('API request failed:', error);
        if (!response.headersSent) {
          sendError(response, error.statusCode || 500,
            error.statusCode ? error.message : 'The request could not be completed.');
        } else {
          response.destroy(error);
        }
      });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method not allowed');
      return;
    }
    serveStatic(request, response, pathname);
  });

  const port = Number(process.env.PORT) || 8000;
  const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  server.on('error', (error) => {
    console.error(`Could not listen on ${host}:${port}:`, error.message);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.log(`Website running at http://${host}:${port}`);
    if (!adminPasswordHash) {
      console.log('Admin login is disabled. Set ADMIN_PASSWORD (minimum 14 characters) to enable it.');
    }
  });
}

startServer().catch((error) => {
  console.error('Could not start the website server:', error);
  process.exitCode = 1;
});
