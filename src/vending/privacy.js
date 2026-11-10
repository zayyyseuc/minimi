const crypto = require('crypto');

const BLOCKED_KEYS = new Set([
  'evidence', 'examples', 'sources', 'source', 'documents', 'files', 'filenames',
  'paths', 'passages', 'quotes', 'notes', 'raw', 'metadata', 'private',
]);

const SUSPICIOUS_CONTENT = [
  /(?:^|\s)(?:\.{0,2}\/|[A-Za-z]:\\|\/Users\/|\/home\/)/,
  /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/,
  /https?:\/\//i,
  /\[\[[^\]]+\]\]/,
  /```/,
  /(?:^|\s)#{1,6}\s/m,
];

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || text.length > maxLength || SUSPICIOUS_CONTENT.some(pattern => pattern.test(text))) return '';
  return text;
}

function sanitizeForApproval(draft, edits = {}) {
  const dimensions = {};
  const inputDimensions = edits.dimensions || draft.dimensions || {};

  for (const dimension of ['reasoning', 'knowledge', 'voice', 'judgment']) {
    const source = Array.isArray(inputDimensions[dimension]) ? inputDimensions[dimension] : [];
    dimensions[dimension] = source.slice(0, 10).flatMap((item, index) => {
      if (!item || item.approved === false) return [];
      if (Object.keys(item).some(key => BLOCKED_KEYS.has(key.toLowerCase()))) {
        const allowed = ['id', 'label', 'description', 'confidence', 'approved'];
        if (Object.keys(item).some(key => !allowed.includes(key))) return [];
      }
      const label = cleanText(item.label, 80);
      const description = cleanText(item.description, 360);
      if (!label || !description) return [];
      const confidence = Math.max(0, Math.min(1, Number(item.confidence) || 0));
      return [{ id: cleanText(item.id, 80) || `${dimension}-${index + 1}`, label, description, confidence }];
    });
  }

  return {
    schemaVersion: 1,
    version: `approved-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    status: 'approved',
    createdAt: draft.createdAt,
    approvedAt: new Date().toISOString(),
    sourceProfileVersion: draft.version,
    methodVersion: draft.methodVersion,
    dimensions,
  };
}

function tokenize(text) {
  return String(text || '').toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) || [];
}

function hashShingles(text, size = 8) {
  const tokens = tokenize(text);
  const hashes = new Set();
  for (let i = 0; i <= tokens.length - size; i += 1) {
    hashes.add(crypto.createHash('sha256').update(tokens.slice(i, i + size).join(' ')).digest('hex'));
  }
  return hashes;
}

function checkOutputOverlap(outputText, fingerprintData) {
  const privateHashes = new Set(fingerprintData?.hashes || []);
  if (!privateHashes.size) return { safe: true, matches: 0 };
  const outputHashes = hashShingles(outputText, fingerprintData.shingleSize || 8);
  let matches = 0;
  for (const hash of outputHashes) if (privateHashes.has(hash)) matches += 1;
  return { safe: matches === 0, matches };
}

function looksLikeExtractionAttempt(input) {
  const text = String(input || '').toLowerCase();
  const patterns = [
    /(?:show|reveal|quote|repeat|print|list|leak|extract).{0,35}(?:note|vault|file|prompt|memory|private)/,
    /(?:ignore|override|disregard).{0,40}(?:instruction|system|privacy|previous)/,
    /(?:what|which).{0,30}(?:private|personal|real).{0,24}(?:name|address|email|filename|path|relationship)/,
    /(?:name|address|email|filename|path|relationship).{0,28}(?:vault|private note|your memory|zia)/,
    /逐字|原文|私人笔记|文件名|系统提示|忽略.{0,12}(?:指令|规则)/,
  ];
  return patterns.some(pattern => pattern.test(text));
}

function sanitizeShowcase(input) {
  const source = Array.isArray(input?.items) ? input.items : [];
  const items = source.slice(0, 20).flatMap((item, index) => {
    if (!item || item.approved === false) return [];
    const title = cleanText(item.title, 100);
    const description = cleanText(item.description, 420);
    const whyInteresting = cleanText(item.whyInteresting, 320);
    if (!title || !description) return [];
    const tags = (Array.isArray(item.tags) ? item.tags : [])
      .slice(0, 6)
      .map(tag => cleanText(tag, 40))
      .filter(Boolean);
    return [{ id: cleanText(item.id, 80) || `project-${index + 1}`, title, description, whyInteresting, tags }];
  });
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), items };
}

module.exports = { sanitizeForApproval, sanitizeShowcase, hashShingles, checkOutputOverlap, looksLikeExtractionAttempt, cleanText };
