const crypto = require('crypto');

const { PRODUCTS, sealedArtifact } = require('./products');
const { looksLikeExtractionAttempt } = require('./privacy');
const { LIMITS, newState, runAgent, resume, agentLog, progress, buildArtifact } = require('./agent');

const CONVERSATION_VERSION = 'agent-v1';
const MAX_CLARIFICATIONS = LIMITS.maxAsks;
const STATE_TTL_MS = 20 * 60 * 1000;
const MAX_REPLY_LENGTH = 600;
const MAX_TOKEN_LENGTH = 20000;

function conversationError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function stateSecret() {
  const secret = process.env.VENDING_STATE_SECRET || process.env.SILICONFLOW_API_KEY;
  if (!secret) throw conversationError('SILICONFLOW_API_KEY is not configured', 503);
  return secret;
}

function sign(value) {
  return crypto.createHmac('sha256', stateSecret()).update(value).digest('base64url');
}

function issueStateToken(state, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    ...state,
    version: CONVERSATION_VERSION,
    issuedAt: now,
    expiresAt: now + STATE_TTL_MS,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readStateToken(token, now = Date.now()) {
  if (typeof token !== 'string' || token.length < 20 || token.length > MAX_TOKEN_LENGTH) {
    throw conversationError('The calibration ticket is invalid. Please start again.');
  }

  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) throw conversationError('The calibration ticket is invalid. Please start again.');
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw conversationError('The calibration ticket was changed. Please start again.');
  }

  let state;
  try { state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { throw conversationError('The calibration ticket is unreadable. Please start again.'); }

  if (state.version !== CONVERSATION_VERSION || !PRODUCTS[state.product] || !state.input) {
    throw conversationError('The calibration ticket is incompatible. Please start again.');
  }
  if (!Number.isFinite(state.expiresAt) || state.expiresAt < now) {
    throw conversationError('The calibration ticket expired. Please start again.', 410);
  }
  return state;
}

function validReply(value) {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= MAX_REPLY_LENGTH;
}

/** Turns a paused agent into the response the browser renders. */
function present({ state, pause }) {
  const base = { progress: progress(state), agentLog: agentLog(state), stateToken: issueStateToken(state) };

  if (pause === 'continue') return { type: 'working', ...base };

  if (pause === 'ask') {
    return {
      type: 'clarification',
      question: state.pending.question,
      options: state.pending.options,
      turn: state.asks,
      maxTurns: LIMITS.maxAsks,
      ...base,
    };
  }

  if (pause === 'plan') {
    return {
      type: 'confirmation',
      stage: 'plan',
      understanding: state.plan.understanding,
      why: state.plan.why,
      product: state.plan.product,
      productLabel: PRODUCTS[state.plan.product].label,
      originalProduct: state.originalProduct,
      originalProductLabel: PRODUCTS[state.originalProduct].label,
      productChanged: state.plan.product !== state.originalProduct,
      canRevise: state.planRedirects < LIMITS.maxPlanRedirects,
      ...base,
    };
  }

  return {
    type: 'confirmation',
    stage: 'draft',
    understanding: state.plan?.understanding || '',
    draft: {
      title: state.draft.title,
      message: state.draft.message,
      productLabel: PRODUCTS[state.product].label,
      behavioralTrace: state.draft.behavioralTrace,
    },
    canRevise: state.feedbackRounds < LIMITS.maxFeedbackRounds,
    feedbackRoundsLeft: LIMITS.maxFeedbackRounds - state.feedbackRounds,
    ...base,
  };
}

function refusal(state) {
  return { type: 'artifact', ...sealedArtifact(state.product) };
}

async function startConversation({ input, product }, deps = {}) {
  if (looksLikeExtractionAttempt(input)) {
    return { type: 'artifact', ...sealedArtifact(product) };
  }
  return present(await runAgent(newState({ input, product }), deps));
}

async function continueConversation({ stateToken, action, answer = '' }, deps = {}) {
  const state = readStateToken(stateToken);
  if (!Array.isArray(state.steps) || typeof state.calls !== 'number') {
    throw conversationError('The calibration ticket is incompatible. Please start again.');
  }

  const text = typeof answer === 'string' ? answer.trim() : '';
  const needsText = () => {
    if (!validReply(text)) throw conversationError(`Reply with between 1 and ${MAX_REPLY_LENGTH} characters.`);
    return text;
  };

  // The agent is mid-loop and only needs another request to keep working.
  if (!state.pending) {
    if (action !== 'continue') throw conversationError('The agent is still working. Continue or start again.');
    return present(await runAgent(state, deps));
  }

  const kind = state.pending.kind;

  if (kind === 'ask') {
    if (!['answer', 'skip'].includes(action)) throw conversationError('Choose an answer or let the machine decide.');
    if (action === 'answer') {
      needsText();
      if (looksLikeExtractionAttempt(text)) return refusal(state);
    }
    resume(state, action === 'skip' ? { type: 'skip' } : { type: 'answer', text });
    return present(await runAgent(state, deps));
  }

  if (kind === 'plan') {
    if (action === 'revise') {
      if (state.planRedirects >= LIMITS.maxPlanRedirects) throw conversationError('This plan has been corrected enough. Approve it or start again.');
      needsText();
      if (looksLikeExtractionAttempt(text)) return refusal(state);
      resume(state, { type: 'redirect', text });
      return present(await runAgent(state, deps));
    }
    if (!['dispense', 'keep'].includes(action)) throw conversationError('Approve the plan, correct it, or start again.');
    resume(state, { type: action === 'keep' ? 'keep' : 'approve' });
    return present(await runAgent(state, deps));
  }

  if (kind === 'draft') {
    if (action === 'revise') {
      if (state.feedbackRounds >= LIMITS.maxFeedbackRounds) throw conversationError('The draft has been revised enough. Accept it or start again.');
      needsText();
      if (looksLikeExtractionAttempt(text)) return refusal(state);
      resume(state, { type: 'feedback', text });
      return present(await runAgent(state, deps));
    }
    if (action !== 'dispense') throw conversationError('Accept the draft, send feedback, or start again.');
    return { type: 'artifact', ...buildArtifact(state) };
  }

  throw conversationError('The calibration ticket has an unknown state. Please start again.');
}

module.exports = {
  CONVERSATION_VERSION,
  MAX_CLARIFICATIONS,
  MAX_REPLY_LENGTH,
  MAX_TOKEN_LENGTH,
  issueStateToken,
  readStateToken,
  validReply,
  startConversation,
  continueConversation,
};
