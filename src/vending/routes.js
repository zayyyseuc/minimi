const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateProduct, PRODUCTS, PROMPT_VERSION } = require('./generator');
const { refreshFromVault } = require('./learning');
const { sanitizeForApproval, sanitizeShowcase } = require('./privacy');
const { getBehavioralProfile, getPublicFacts, getPublicBasis } = require('./public-profile');
const store = require('./profile-store');

const router = express.Router();
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = Number(process.env.VENDING_RATE_LIMIT || 24);

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const recent = (attempts.get(key) || []).filter(time => now - time < WINDOW_MS);
  if (recent.length >= LIMIT) return res.status(429).json({ error: 'The machine is cooling down. Try again in a few minutes.' });
  recent.push(now);
  attempts.set(key, recent);
  next();
}

function validInput(value) {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 1200;
}

function timingSafeEqual(a, b) {
  const first = Buffer.from(String(a || ''));
  const second = Buffer.from(String(b || ''));
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function ownerOnly(req, res, next) {
  const configured = process.env.VENDING_OWNER_TOKEN;
  const provided = req.get('x-owner-token') || req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!configured || !timingSafeEqual(configured, provided)) {
    return res.status(401).json({ error: 'Owner authentication required' });
  }
  res.setHeader('Cache-Control', 'no-store');
  next();
}

router.get('/status', (req, res) => {
  const active = getBehavioralProfile();
  res.json({
    ready: Boolean(process.env.SILICONFLOW_API_KEY),
    personalized: true,
    profileVersion: active.version,
    publicProfileVersion: getPublicBasis().profileVersion,
    promptVersion: PROMPT_VERSION,
    publicFactCount: getPublicFacts().length,
    basis: getPublicBasis(),
    products: Object.entries(PRODUCTS).map(([id, product]) => ({ id, label: product.label, format: product.format })),
  });
});

router.post('/dispense', rateLimit, async (req, res) => {
  const input = req.body?.input;
  const product = req.body?.product;
  if (!validInput(input)) return res.status(400).json({ error: 'Insert between 2 and 1,200 characters.' });
  if (!PRODUCTS[product]) return res.status(400).json({ error: 'Choose a valid product.' });
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await generateProduct({ input: input.trim(), product }));
  } catch (error) {
    console.error('[vending/dispense]', error.message);
    res.status(error.status || 500).json({ error: error.message || 'The machine jammed.' });
  }
});

router.get('/owner/profiles', ownerOnly, (req, res) => {
  res.json({ active: store.getActive(), drafts: store.listDrafts(), approved: store.listApproved(), showcase: store.getShowcase() });
});

router.get('/owner/drafts/:version', ownerOnly, (req, res) => {
  const draft = store.getDraft(req.params.version);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  res.json(draft);
});

router.post('/owner/learn', ownerOnly, (req, res) => {
  try {
    const draft = refreshFromVault(process.env.VAULT_PATH);
    res.status(201).json(draft);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/owner/drafts/:version/approve', ownerOnly, (req, res) => {
  const draft = store.getDraft(req.params.version);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  const approved = sanitizeForApproval(draft, req.body || {});
  const count = store.DIMENSIONS.reduce((sum, key) => sum + approved.dimensions[key].length, 0);
  if (!count) return res.status(400).json({ error: 'Approve at least one safe characteristic.' });
  res.status(201).json(store.saveApproved(approved));
});

router.post('/owner/profiles/:version/activate', ownerOnly, (req, res) => {
  const profile = store.activateApproved(req.params.version);
  if (!profile) return res.status(404).json({ error: 'Approved profile not found' });
  res.json(profile);
});

router.get('/owner/showcase', ownerOnly, (req, res) => {
  res.json(store.getShowcase());
});

router.put('/owner/showcase', ownerOnly, (req, res) => {
  const showcase = sanitizeShowcase(req.body || {});
  res.json(store.saveShowcase(showcase));
});

router.post('/owner/evaluate', ownerOnly, async (req, res) => {
  const { input, product } = req.body || {};
  if (!validInput(input) || !PRODUCTS[product]) return res.status(400).json({ error: 'Valid input and product are required.' });
  try {
    const modes = ['generic', 'basic', 'learned'];
    const outputs = [];
    for (const mode of modes) outputs.push({ mode, artifact: await generateProduct({ input: input.trim(), product, mode }) });
    const record = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), promptVersion: PROMPT_VERSION, profileVersion: store.getActive()?.version || null, input: input.trim(), product, outputs };
    const logDir = path.join(__dirname, '../../data/vending/evaluations');
    fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(path.join(logDir, 'runs.jsonl'), `${JSON.stringify(record)}\n`, { mode: 0o600 });
    res.json(record);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = { router, ownerOnly, rateLimit, validInput };
