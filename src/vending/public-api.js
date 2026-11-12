const { generateProduct, PRODUCTS } = require('./generator');
const { AGENT_VERSION, LIMITS, TOOLS } = require('./agent');
const { MAX_CLARIFICATIONS, MAX_REPLY_LENGTH, MAX_TOKEN_LENGTH, startConversation, continueConversation } = require('./conversation');
const { getBehavioralProfile, getPublicFacts, getPublicBasis } = require('./public-profile');

const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;

function isModelTimeout(error) {
  return error?.name === 'APIConnectionTimeoutError'
    || error?.code === 'ETIMEDOUT'
    || /timed?\s*out|timeout/i.test(String(error?.message || ''));
}

function publicModelError(error, fallback) {
  if (isModelTimeout(error)) {
    return { status: 504, message: 'The model took too long to respond. Pull again.' };
  }
  if (error?.message === 'SILICONFLOW_API_KEY is not configured') {
    return { status: 503, message: error.message };
  }
  return { status: error?.status || 500, message: error?.message || fallback };
}

function validInput(value) {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 1200;
}

function validStateToken(value) {
  return typeof value === 'string' && value.length >= 20 && value.length <= MAX_TOKEN_LENGTH;
}

function rateLimited(key) {
  const limit = Number(process.env.VENDING_RATE_LIMIT || 60);
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
    promptVersion: AGENT_VERSION,
    publicFactCount: getPublicFacts().length,
    basis: getPublicBasis(),
    conversation: { enabled: true, maxClarifications: MAX_CLARIFICATIONS, maxReplyLength: MAX_REPLY_LENGTH },
    agent: { enabled: true, tools: TOOLS, humanCheckpoints: ['ask_visitor', 'propose_plan', 'present_draft'], limits: { asks: LIMITS.maxAsks, planRedirects: LIMITS.maxPlanRedirects, draftFeedbackRounds: LIMITS.maxFeedbackRounds, totalSteps: LIMITS.totalSteps } },
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
    const failure = publicModelError(error, 'The machine jammed.');
    return res.status(failure.status).json({ error: failure.message });
  }
}

async function turnHandler(req, res) {
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

  try {
    if (!body.stateToken) {
      if (!validInput(body.input)) return res.status(400).json({ error: 'Insert between 2 and 1,200 characters.' });
      if (!PRODUCTS[body.product]) return res.status(400).json({ error: 'Choose a valid product.' });
      return res.status(200).json(await startConversation({ input: body.input.trim(), product: body.product }));
    }

    if (!validStateToken(body.stateToken)) return res.status(400).json({ error: 'The calibration ticket is invalid. Please start again.' });
    const action = typeof body.action === 'string' ? body.action : '';
    const answer = typeof body.answer === 'string' ? body.answer : '';
    return res.status(200).json(await continueConversation({ stateToken: body.stateToken, action, answer }));
  } catch (error) {
    console.error('[vending/turn]', error.message);
    const failure = publicModelError(error, 'The calibration mechanism jammed.');
    return res.status(failure.status).json({ error: failure.message });
  }
}

module.exports = {
  validInput,
  validStateToken,
  isModelTimeout,
  publicModelError,
  statusPayload,
  statusHandler,
  dispenseHandler,
  turnHandler,
};
