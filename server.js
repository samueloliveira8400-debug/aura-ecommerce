require('dotenv').config();

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Configure DATABASE_URL com a conexão do PostgreSQL.');
if (isProduction && (
  !process.env.SESSION_SECRET ||
  process.env.SESSION_SECRET.length < 32 ||
  process.env.SESSION_SECRET.startsWith('troque-') ||
  !process.env.ADMIN_EMAIL ||
  !process.env.ADMIN_PASSWORD ||
  Buffer.byteLength(process.env.ADMIN_PASSWORD, 'utf8') < 12 ||
  Buffer.byteLength(process.env.ADMIN_PASSWORD, 'utf8') > 72 ||
  process.env.ADMIN_PASSWORD.startsWith('troque-') ||
  process.env.ADMIN_EMAIL.toLowerCase().endsWith('@example.com')
)) {
  throw new Error('Em produção, configure SESSION_SECRET, ADMIN_EMAIL e ADMIN_PASSWORD.');
}
const database = new Pool({
  connectionString: databaseUrl,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});
database.on('error', (error) => console.error('postgres_pool_error', error));

async function initializeDatabase() {
  await database.query(`
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
    old_price_cents INTEGER,
    image TEXT NOT NULL,
    badge TEXT DEFAULT '',
    stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    demo INTEGER NOT NULL DEFAULT 1 CHECK(demo IN (0, 1)),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    expires_at BIGINT,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_code TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address_json TEXT NOT NULL,
    items_json TEXT NOT NULL,
    subtotal_cents INTEGER NOT NULL,
    shipping_cents INTEGER NOT NULL,
    discount_cents INTEGER NOT NULL DEFAULT 0,
    coupon_code TEXT,
    total_cents INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Aguardando pagamento demonstrativo',
    demo INTEGER NOT NULL DEFAULT 1 CHECK(demo IN (0, 1)),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS coupons (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    discount_type TEXT NOT NULL CHECK(discount_type IN ('percent', 'fixed')),
    discount_value INTEGER NOT NULL CHECK(discount_value > 0),
    minimum_subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK(minimum_subtotal_cents >= 0),
    usage_limit INTEGER CHECK(usage_limit IS NULL OR usage_limit > 0),
    usage_count INTEGER NOT NULL DEFAULT 0 CHECK(usage_count >= 0),
    expires_at TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const demoProducts = [
  ['Dior Sauvage Eau de Toilette', 'perfumes', 'Nome comercial de um perfume conhecido, incluído para demonstração. Imagem ilustrativa; preço, estoque e disponibilidade fictícios.', 42990, 51990, 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=900&q=85', 'Perfume', 18],
  ['Chanel Coco Mademoiselle Eau de Parfum', 'perfumes', 'Nome comercial de um perfume conhecido, incluído para demonstração. Imagem ilustrativa; preço, estoque e disponibilidade fictícios.', 56990, null, 'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=900&q=85', 'Perfume', 12],
  ['Chanel N°5 Eau de Parfum', 'perfumes', 'Nome comercial de um perfume conhecido, incluído para demonstração. Imagem ilustrativa; preço, estoque e disponibilidade fictícios.', 59990, null, 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=900&q=85', 'Perfume', 9],
  ['Carolina Herrera Good Girl Eau de Parfum', 'perfumes', 'Nome comercial de um perfume conhecido, incluído para demonstração. Imagem ilustrativa; preço, estoque e disponibilidade fictícios.', 48990, null, 'https://images.unsplash.com/photo-1595425970377-c9703cf48b6d?auto=format&fit=crop&w=900&q=85', 'Perfume', 15],
  ['NIVEA Creme', 'cosmeticos', 'Produto conhecido de cuidados pessoais, incluído para demonstração. Imagem ilustrativa; preço, estoque e disponibilidade fictícios.', 2990, 3990, 'https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?auto=format&fit=crop&w=900&q=85', 'Cuidados pessoais', 21],
  ['CeraVe Creme Hidratante', 'cosmeticos', 'Produto conhecido de cuidados pessoais, incluído para demonstração. Imagem ilustrativa; preço, estoque e disponibilidade fictícios.', 8990, null, 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85', 'Cuidados pessoais', 27],
  ['La Roche-Posay Cicaplast Baume B5+', 'cosmeticos', 'Produto conhecido de cuidados pessoais, incluído para demonstração. Imagem ilustrativa; preço, estoque e disponibilidade fictícios.', 9990, null, 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=85', 'Cuidados pessoais', 14],
  ['Apple iPhone 15', 'smartphones', 'Nome comercial de smartphone conhecido, incluído para demonstração. Não são declaradas especificações, disponibilidade ou preço reais; imagem ilustrativa.', 329990, 359990, 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=900&q=85', 'Smartphone', 7],
  ['Samsung Galaxy S24', 'smartphones', 'Nome comercial de smartphone conhecido, incluído para demonstração. Não são declaradas especificações, disponibilidade ou preço reais; imagem ilustrativa.', 299990, null, 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=85', 'Smartphone', 11]
];

  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const existingProducts = await client.query('SELECT 1 FROM products WHERE demo = 1 LIMIT 1');
    if (existingProducts.rowCount === 0) {
      for (const product of demoProducts) {
        await client.query(`
          INSERT INTO products (name, category, description, price_cents, old_price_cents, image, badge, stock, demo)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
        `, product);
      }
    }

    const configuredEmail = (process.env.ADMIN_EMAIL || 'admin@localhost').trim().toLowerCase();
    if (process.env.ADMIN_EMAIL && configuredEmail !== 'admin@localhost') {
      await client.query('DELETE FROM admins WHERE email = $1', ['admin@localhost']);
    }
    const existingAdmin = await client.query('SELECT id FROM admins WHERE email = $1', [configuredEmail]);
    let adminPassword = process.env.ADMIN_PASSWORD || '';
    if (existingAdmin.rowCount === 0 && !adminPassword) {
      adminPassword = crypto.randomBytes(18).toString('base64url');
      console.warn(`Senha temporária do administrador (${configuredEmail}): ${adminPassword}`);
    }
    if (existingAdmin.rowCount === 0) {
      await client.query('INSERT INTO admins (email, password_hash) VALUES ($1, $2)', [
        configuredEmail, bcrypt.hashSync(adminPassword, 12)
      ]);
    } else if (adminPassword) {
      await client.query('UPDATE admins SET password_hash = $1 WHERE email = $2', [
        bcrypt.hashSync(adminPassword, 12), configuredEmail
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

class PostgresSessionStore extends session.Store {
  get(sid, callback) {
    database.query('SELECT expires_at, data FROM sessions WHERE sid = $1', [sid]).then(async ({ rows }) => {
      const row = rows[0];
      if (!row) return callback(null, null);
      if (row.expires_at !== null && Number(row.expires_at) <= Date.now()) {
        await database.query('DELETE FROM sessions WHERE sid = $1', [sid]);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.data));
    }).catch(callback);
  }

  set(sid, sessionData, callback = () => {}) {
    const expiresAt = sessionData.cookie && sessionData.cookie.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : null;
    database.query(`
      INSERT INTO sessions (sid, expires_at, data) VALUES ($1, $2, $3)
      ON CONFLICT(sid) DO UPDATE SET expires_at = EXCLUDED.expires_at, data = EXCLUDED.data
    `, [sid, expiresAt, JSON.stringify(sessionData)]).then(() => callback(null)).catch(callback);
  }

  destroy(sid, callback = () => {}) {
    database.query('DELETE FROM sessions WHERE sid = $1', [sid]).then(() => callback(null)).catch(callback);
  }

  touch(sid, sessionData, callback = () => {}) {
    const expiresAt = sessionData.cookie && sessionData.cookie.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : null;
    database.query('UPDATE sessions SET expires_at = $1 WHERE sid = $2', [expiresAt, sid])
      .then(() => callback(null)).catch(callback);
  }
}

app.disable('x-powered-by');
app.set('trust proxy', isProduction ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  }
}));
app.use(express.json({ limit: '30kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(session({
  name: 'aura.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-this-session-secret',
  resave: false,
  saveUninitialized: false,
  store: new PostgresSessionStore(),
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: 8 * 60 * 60 * 1000 }
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false });
const orderLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false });
const categories = new Set(['perfumes', 'cosmeticos', 'smartphones']);
const paymentMethods = new Set(['pix_mock', 'boleto_mock', 'card_mock']);
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: 'Acesso restrito ao painel administrativo.' });
  next();
}

function validText(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function validImageSource(value) {
  if (!validText(value, 1000)) return false;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validateProduct(body) {
  const errors = [];
  if (!validText(body.name, 120)) errors.push('informe um nome com até 120 caracteres');
  if (!categories.has(body.category)) errors.push('selecione uma categoria válida');
  if (!validText(body.description, 1200)) errors.push('informe uma descrição com até 1.200 caracteres');
  if (!Number.isSafeInteger(body.priceCents) || body.priceCents < 1 || body.priceCents > 100000000) {
    errors.push('informe um preço maior que R$ 0,00');
  }
  if (body.oldPriceCents !== null && body.oldPriceCents !== undefined &&
      (!Number.isSafeInteger(body.oldPriceCents) || body.oldPriceCents < 0 || body.oldPriceCents > 100000000)) {
    errors.push('corrija o preço anterior ou deixe o campo vazio');
  }
  if (!validImageSource(body.image)) errors.push('informe uma URL de imagem HTTPS válida ou um caminho local iniciado por /');
  if (!Number.isInteger(body.stock) || body.stock < 0 || body.stock > 100000) {
    errors.push('informe o estoque como um número inteiro entre 0 e 100.000');
  }
  if (body.badge !== undefined && (typeof body.badge !== 'string' || body.badge.length > 40)) {
    errors.push('o selo pode ter no máximo 40 caracteres');
  }
  return errors;
}

function normalizeCouponCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function couponDiscount(coupon, subtotalCents) {
  if (!coupon || !coupon.active) return { error: 'Cupom inválido ou inativo.' };
  if (coupon.expires_at && Date.parse(coupon.expires_at) <= Date.now()) return { error: 'Este cupom expirou.' };
  if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) return { error: 'Este cupom atingiu o limite de utilizações.' };
  if (subtotalCents < coupon.minimum_subtotal_cents) {
    return { error: `O pedido mínimo para este cupom é R$ ${(coupon.minimum_subtotal_cents / 100).toFixed(2).replace('.', ',')}.` };
  }
  const amount = coupon.discount_type === 'percent'
    ? Math.floor(subtotalCents * coupon.discount_value / 100)
    : coupon.discount_value;
  return { discountCents: Math.min(subtotalCents, amount) };
}

app.use('/api/admin', adminLimiter);

app.get('/api/products', asyncHandler(async (req, res) => {
  const { rows } = await database.query('SELECT * FROM products WHERE active = 1 ORDER BY id DESC');
  res.json(rows);
}));

app.get('/api/products/:id', asyncHandler(async (req, res) => {
  const { rows } = await database.query('SELECT * FROM products WHERE id = $1 AND active = 1', [Number(req.params.id)]);
  const product = rows[0];
  if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });
  res.json(product);
}));

app.post('/api/coupons/validate', asyncHandler(async (req, res) => {
  const code = normalizeCouponCode(req.body && req.body.code);
  const items = req.body && req.body.items;
  if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !Array.isArray(items) || items.length < 1 || items.length > 30) {
    return res.status(400).json({ error: 'Informe um cupom válido e os itens da sacola.' });
  }
  let subtotalCents = 0;
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return res.status(400).json({ error: 'Revise os itens e quantidades da sacola.' });
    }
    const { rows } = await database.query(
      'SELECT id, price_cents, stock FROM products WHERE id = $1 AND active = 1',
      [Number(item.id)]
    );
    const product = rows[0];
    const quantity = Number(item.quantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20 || quantity > product.stock) {
      return res.status(400).json({ error: 'Revise os itens e quantidades da sacola.' });
    }
    subtotalCents += product.price_cents * quantity;
  }
  const { rows } = await database.query('SELECT * FROM coupons WHERE code = $1', [code]);
  const coupon = rows[0];
  const result = couponDiscount(coupon, subtotalCents);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json({ code, discountCents: result.discountCents, subtotalCents });
}));

app.post('/api/orders', orderLimiter, asyncHandler(async (req, res) => {
  const { customer, address, items, paymentMethod } = req.body || {};
  const couponCode = req.body && req.body.couponCode ? normalizeCouponCode(req.body.couponCode) : '';
  if (!customer || typeof customer !== 'object' || Array.isArray(customer) ||
      !address || typeof address !== 'object' || Array.isArray(address) ||
      !Array.isArray(items) || items.length < 1 || items.length > 30) {
    return res.status(400).json({ error: 'Revise os dados do pedido.' });
  }
  if (!validText(customer.name, 100) || !validText(customer.email, 180) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) ||
      !validText(customer.phone, 30) || !validText(address.postalCode, 12) ||
      !/^\d{5}-?\d{3}$/.test(address.postalCode.replace(/\s/g, '')) ||
      !validText(address.street, 140) || !validText(address.number, 20) ||
      !validText(address.neighborhood, 80) || !validText(address.city, 80) ||
      typeof address.state !== 'string' || !/^[A-Z]{2}$/.test(address.state) ||
      (address.complement !== undefined && (typeof address.complement !== 'string' || address.complement.length > 100)) ||
      !paymentMethods.has(paymentMethod)) {
    return res.status(400).json({ error: 'Informe contato, endereço e uma opção de pagamento demonstrativo válidos.' });
  }

  if (couponCode && !/^[A-Z0-9_-]{3,40}$/.test(couponCode)) return res.status(400).json({ error: 'Cupom inválido.' });
  const client = await database.connect();
  let result;
  try {
    await client.query('BEGIN');
    const normalizedItems = [];
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Revise os itens e quantidades da sacola.' });
      }
      const quantity = Number(item.quantity);
      const { rows } = await client.query(
        'SELECT * FROM products WHERE id = $1 AND active = 1',
        [Number(item.id)]
      );
      const product = rows[0];
      if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20 || quantity > product.stock) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Um item do carrinho não está disponível na quantidade solicitada.' });
      }
      normalizedItems.push({ id: product.id, name: product.name, quantity, unitPriceCents: product.price_cents });
    }
    const subtotal = normalizedItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    let discount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      const { rows } = await client.query('SELECT * FROM coupons WHERE code = $1 FOR UPDATE', [couponCode]);
      appliedCoupon = rows[0];
      const couponResult = couponDiscount(appliedCoupon, subtotal);
      if (couponResult.error) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: couponResult.error });
      }
      discount = couponResult.discountCents;
    }
    const postalDigits = address.postalCode.replace(/\D/g, '');
    const shipping = subtotal >= 25000 ? 0 : (Number(postalDigits.slice(-1)) % 2 === 0 ? 1490 : 1990);
    const total = Math.max(0, subtotal - discount) + shipping;
    const code = `AU-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    await client.query(`
      INSERT INTO orders (order_code, customer_name, email, phone, address_json, items_json, subtotal_cents, shipping_cents, discount_cents, coupon_code, total_cents, payment_method)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [code, customer.name.trim(), customer.email.trim().toLowerCase(), customer.phone.trim(),
      JSON.stringify(address), JSON.stringify(normalizedItems), subtotal, shipping, discount,
      appliedCoupon ? appliedCoupon.code : null, total, paymentMethod]);
    if (appliedCoupon) {
      await client.query('UPDATE coupons SET usage_count = usage_count + 1 WHERE id = $1', [appliedCoupon.id]);
    }
    result = { orderCode: code, subtotalCents: subtotal, discountCents: discount, couponCode: appliedCoupon ? appliedCoupon.code : null, shippingCents: shipping, totalCents: total };
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return res.status(201).json({
    ...result,
    status: 'Aguardando pagamento demonstrativo',
    notice: 'Pedido de demonstração registrado. Nenhuma cobrança ou transação real foi realizada.'
  });
}));

app.get('/api/account/orders', orderLimiter, asyncHandler(async (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) {
    return res.status(400).json({ error: 'Informe um e-mail válido para consultar seus pedidos.' });
  }
  const { rows } = await database.query(`
    SELECT order_code, items_json, total_cents, status, created_at, demo
    FROM orders WHERE email = $1 ORDER BY id DESC LIMIT 25
  `, [email]);
  const orders = rows.map((order) => ({
    orderCode: order.order_code, items: JSON.parse(order.items_json),
    totalCents: order.total_cents, status: order.status, createdAt: order.created_at.toISOString(), demo: Boolean(order.demo)
  }));
  res.json({ orders });
}));

app.post('/api/admin/login', authLimiter, asyncHandler(async (req, res, next) => {
  const { email, password } = req.body || {};
  if (!validText(email, 180) || typeof password !== 'string' || password.length > 200) {
    return res.status(400).json({ error: 'Informe e-mail e senha.' });
  }
  const { rows } = await database.query(
    'SELECT id, email, password_hash FROM admins WHERE email = $1',
    [email.trim().toLowerCase()]
  );
  const admin = rows[0];
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }
  req.session.regenerate((error) => {
    if (error) return next(error);
    req.session.adminId = admin.id;
    req.session.adminEmail = admin.email;
    res.json({ email: admin.email });
  });
}));

app.post('/api/admin/logout', requireAdmin, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('aura.sid');
    res.json({ message: 'Sessão encerrada.' });
  });
});

app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ email: req.session.adminEmail }));
app.get('/api/admin/products', requireAdmin, asyncHandler(async (req, res) => {
  const { rows } = await database.query('SELECT * FROM products ORDER BY id DESC');
  res.json(rows);
}));

app.get('/api/admin/coupons', requireAdmin, asyncHandler(async (req, res) => {
  const { rows } = await database.query('SELECT * FROM coupons ORDER BY id DESC');
  res.json(rows);
}));

app.post('/api/admin/coupons', requireAdmin, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const code = normalizeCouponCode(body.code);
  const validDiscount = body.discountType === 'percent'
    ? Number.isInteger(body.discountValue) && body.discountValue >= 1 && body.discountValue <= 100
    : body.discountType === 'fixed' && Number.isSafeInteger(body.discountValue) && body.discountValue > 0 && body.discountValue <= 100000000;
  const minimum = body.minimumSubtotalCents === undefined ? 0 : body.minimumSubtotalCents;
  const usageLimit = body.usageLimit === null || body.usageLimit === undefined ? null : body.usageLimit;
  const expiresAt = body.expiresAt || null;
  if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !validDiscount ||
      !Number.isSafeInteger(minimum) || minimum < 0 || minimum > 100000000 ||
      (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1 || usageLimit > 1000000)) ||
      (expiresAt !== null && (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()))) {
    return res.status(400).json({ error: 'Confira o código, desconto, mínimo, limite de usos e validade.' });
  }
  try {
    const { rows } = await database.query(`
      INSERT INTO coupons (code, discount_type, discount_value, minimum_subtotal_cents, usage_limit, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [code, body.discountType, body.discountValue, minimum, usageLimit, expiresAt]);
    return res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe um cupom com este código.' });
    throw error;
  }
}));

app.put('/api/admin/coupons/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const currentResult = await database.query('SELECT * FROM coupons WHERE id = $1', [id]);
  const current = currentResult.rows[0];
  if (!current) return res.status(404).json({ error: 'Cupom não encontrado.' });
  const body = req.body || {};
  if (typeof body.active === 'boolean') {
    const { rows } = await database.query(
      'UPDATE coupons SET active = $1 WHERE id = $2 RETURNING *',
      [body.active ? 1 : 0, id]
    );
    return res.json(rows[0]);
  }
  const code = normalizeCouponCode(body.code);
  const discountType = body.discountType;
  const discountValue = body.discountValue;
  const minimum = body.minimumSubtotalCents;
  const usageLimit = body.usageLimit === '' || body.usageLimit === null ? null : body.usageLimit;
  const expiresAt = body.expiresAt || null;
  const validDiscount = discountType === 'percent'
    ? Number.isInteger(discountValue) && discountValue >= 1 && discountValue <= 100
    : discountType === 'fixed' && Number.isSafeInteger(discountValue) && discountValue > 0 && discountValue <= 100000000;
  if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !validDiscount ||
      !Number.isSafeInteger(minimum) || minimum < 0 || minimum > 100000000 ||
      (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < current.usage_count || usageLimit < 1 || usageLimit > 1000000)) ||
      (expiresAt !== null && (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()))) {
    return res.status(400).json({ error: 'Confira o código, desconto, mínimo, limite de usos e validade.' });
  }
  try {
    const { rows } = await database.query(`
      UPDATE coupons SET code = $1, discount_type = $2, discount_value = $3, minimum_subtotal_cents = $4, usage_limit = $5, expires_at = $6
      WHERE id = $7
      RETURNING *
    `, [code, discountType, discountValue, minimum, usageLimit, expiresAt, id]);
    return res.json(rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe um cupom com este código.' });
    throw error;
  }
}));

app.delete('/api/admin/coupons/:id', requireAdmin, asyncHandler(async (req, res) => {
  const result = await database.query('DELETE FROM coupons WHERE id = $1', [Number(req.params.id)]);
  if (!result.rowCount) return res.status(404).json({ error: 'Cupom não encontrado.' });
  return res.status(204).end();
}));

app.post('/api/admin/products', requireAdmin, asyncHandler(async (req, res) => {
  const { name, category, description, priceCents, oldPriceCents, image, badge, stock } = req.body || {};
  const errors = validateProduct({ name, category, description, priceCents, oldPriceCents, image, badge, stock });
  if (errors.length) return res.status(400).json({ error: `Dados do produto inválidos: ${errors.join('; ')}.` });
  const { rows } = await database.query(`
    INSERT INTO products (name, category, description, price_cents, old_price_cents, image, badge, stock, demo)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
    RETURNING *
  `, [name.trim(), category, description.trim(), priceCents, oldPriceCents || null, image.trim(), (badge || '').slice(0, 40), stock]);
  res.status(201).json(rows[0]);
}));

app.put('/api/admin/products/:id', requireAdmin, asyncHandler(async (req, res) => {
  const currentResult = await database.query('SELECT * FROM products WHERE id = $1', [Number(req.params.id)]);
  const current = currentResult.rows[0];
  if (!current) return res.status(404).json({ error: 'Produto não encontrado.' });
  const body = req.body || {};
  const name = body.name === undefined ? current.name : body.name;
  const category = body.category === undefined ? current.category : body.category;
  const description = body.description === undefined ? current.description : body.description;
  const priceCents = body.priceCents === undefined ? current.price_cents : body.priceCents;
  const oldPriceCents = body.oldPriceCents === undefined ? current.old_price_cents : body.oldPriceCents;
  const image = body.image === undefined ? current.image : body.image;
  const badge = body.badge === undefined ? current.badge : body.badge;
  const stock = body.stock === undefined ? current.stock : body.stock;
  const errors = validateProduct({ name, category, description, priceCents, oldPriceCents, image, badge, stock });
  if (errors.length) return res.status(400).json({ error: `Dados do produto inválidos: ${errors.join('; ')}.` });
  const { rows } = await database.query(`
    UPDATE products SET name = $1, category = $2, description = $3, price_cents = $4, old_price_cents = $5, image = $6, badge = $7, stock = $8, active = $9
    WHERE id = $10
    RETURNING *
  `, [name.trim(), category, description.trim(), priceCents, oldPriceCents, image.trim(), badge.slice(0, 40), stock,
    body.active === undefined ? current.active : (body.active ? 1 : 0), current.id]);
  res.json(rows[0]);
}));

app.get('/api/admin/orders', requireAdmin, asyncHandler(async (req, res) => {
  const { rows } = await database.query('SELECT * FROM orders ORDER BY id DESC LIMIT 200');
  const orders = rows.map((order) => ({
    ...order, address: JSON.parse(order.address_json), items: JSON.parse(order.items_json), demo: Boolean(order.demo)
  }));
  res.json(orders);
}));

app.patch('/api/admin/orders/:id', requireAdmin, asyncHandler(async (req, res) => {
  const allowedStatuses = new Set(['Aguardando pagamento demonstrativo', 'Em preparação (demo)', 'Enviado (demo)', 'Cancelado (demo)']);
  if (!allowedStatuses.has(req.body && req.body.status)) {
    return res.status(400).json({ error: 'Status de pedido inválido.' });
  }
  const result = await database.query(
    'UPDATE orders SET status = $1 WHERE id = $2',
    [req.body.status, Number(req.params.id)]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json({ message: 'Status do pedido atualizado.' });
}));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
for (const assetDirectory of ['css', 'js', 'pages', 'images']) {
  app.use(`/${assetDirectory}`, express.static(path.join(__dirname, assetDirectory), {
    dotfiles: 'ignore', etag: true, maxAge: isProduction ? '1h' : 0
  }));
}
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Ocorreu um erro interno. Tente novamente.' });
});

async function startServer() {
  await initializeDatabase();
  const server = app.listen(PORT, () => {
    console.log(`Aura disponível em http://localhost:${PORT}`);
  });
  const shutdown = () => {
    server.close(() => {
      database.end().then(() => process.exit(0)).catch((error) => {
        console.error('database_shutdown_failed', error);
        process.exit(1);
      });
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((error) => {
  console.error('server_start_failed', error);
  process.exitCode = 1;
});
