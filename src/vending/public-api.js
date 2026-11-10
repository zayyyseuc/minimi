const { generateProduct, PRODUCTS, PROMPT_VERSION } = require('./generator');
const { getBehavioralProfile, getPublicFacts, getPublicBasis } = require('./public-profile');

const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;

function validInput(value) {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 1200;
}

function rateLimited(key) {
  const limit = Number(process.env.VENDING_RATE_LIMIT || 24);
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter(time => now - time < WINDOW_MS);
  if (recent.length >= limit) return true;
  recent.push(now);
  attempts.set(key, recent);
  return false;
}

function setCommonHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function statusPayload() {
  const profile = getBehavioralProfile();
  return {
    ready: Boolean(process.env.SILICONFLOW_API_KEY),
    personalized: true,
    profileVersion: profile.version,
    publicProfileVersion: getPublicBasis().profileVersion,
    promptVersion: PROMPT_VERSION,
    publicFactCount: getPublicFacts().length,
    basis: getPublicBasis(),
    products: Object.entries(PRODUCTS).map(([id, product]) => ({ id, label: product.label, format: product.format })),
  };
}

function statusHandler(req, res) {
  setCommonHeaders(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(200).json(statusPayload());
}

async function dispenseHandler(req, res) {
  setCommonHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const forwarded = req.headers?.['x-forwarded-for'];
  const key = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (rateLimited(key)) return res.status(429).json({ error: 'The machine is cooling down. Try again in a few minutes.' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  const { input, product } = body;
  if (!validInput(input)) return res.status(400).json({ error: 'Insert between 2 and 1,200 characters.' });
  if (!PRODUCTS[product]) return res.status(400).json({ error: 'Choose a valid product.' });

  try {
    return res.status(200).json(await generateProduct({ input: input.trim(), product }));
  } catch (error) {
    console.error('[vending/dispense]', error.message);
    const status = error.message === 'SILICONFLOW_API_KEY is not configured' ? 503 : (error.status || 500);
    return res.status(status).json({ error: error.message || 'The machine jammed.' });
  }
}

module.exports = { validInput, statusPayload, statusHandler, dispenseHandler };
