const crypto = require('crypto');

const { getBehavioralProfile, getPublicBasis } = require('./public-profile');

const AGENT_VERSION = 'vending-agent-v1';

const PRODUCTS = {
  reality_check: {
    label: 'REALITY CHECK',
    format: 'receipt',
    instruction: 'Identify exactly one consequential weakness, hidden assumption, contradiction, or missing mechanism. Be direct and constructive. A small dry joke is welcome only if it sharpens the point. End with one concrete question or test.',
  },
  unexpected_connection: {
    label: 'UNEXPECTED CONNECTION',
    format: 'card',
    instruction: 'Connect the input to one seemingly distant, publicly known concept or domain. Make the bridge surprising but defensible, and explain the mechanism of the connection. Never imply the connection came from a private note.',
  },
  wild_card: {
    label: 'WILD CARD',
    format: 'capsule',
    instruction: 'Dispense one strange but usable creative intervention, constraint, role reversal, or experiment. It may be absurd, but its relationship to the input must remain legible and it should invite action.',
  },
};

function serialFor(product) {
  const prefix = { reality_check: 'RC', unexpected_connection: 'UC', wild_card: 'WC' }[product];
  return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function primaryLanguage(input) {
  const cjk = (String(input).match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (String(input).match(/[A-Za-z]/g) || []).length;
  return cjk > 0 && cjk >= latin * 0.18 ? 'zh' : 'en';
}

/** The in-voice artifact returned when a visitor tries to pull private material out of the machine. */
function sealedArtifact(product) {
  return {
    title: 'ACCESS HATCH SEALED',
    message: 'This machine dispenses new thoughts, not private notes. Try inserting an idea of your own—the mechanism is much more interesting when it has something to transform.',
    productType: product,
    productLabel: PRODUCTS[product].label,
    format: PRODUCTS[product].format,
    serial: serialFor(product),
    profileVersion: getBehavioralProfile().version,
    publicProfileVersion: getPublicBasis().profileVersion,
    promptVersion: AGENT_VERSION,
    personalized: true,
    profileBasis: getPublicBasis(),
  };
}

module.exports = { AGENT_VERSION, PRODUCTS, serialFor, primaryLanguage, sealedArtifact };
