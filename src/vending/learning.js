const fs = require('fs');
const path = require('path');
const { hashShingles } = require('./privacy');
const store = require('./profile-store');

const METHOD_VERSION = 'local-heuristics-v1';

const DOMAIN_LEXICON = {
  design: ['design', '设计', 'interface', '界面', 'visual', '视觉', 'prototype', '原型'],
  'human-computer interaction': ['hci', 'interaction', '交互', 'usability', '用户体验', 'ux'],
  technology: ['technology', '技术', 'software', '软件', 'ai', '人工智能', 'code', '代码'],
  literature: ['literature', '文学', 'novel', '小说', 'poem', '诗歌', 'narrative', '叙事'],
  sociology: ['sociology', '社会学', 'society', '社会', 'institution', '制度'],
  anthropology: ['anthropology', '人类学', 'ritual', '仪式', 'ethnography', '民族志'],
  philosophy: ['philosophy', '哲学', 'ethics', '伦理', 'ontology', '本体'],
  'cultural studies': ['culture', '文化', 'media', '媒介', 'identity', '身份'],
  education: ['education', '教育', 'learning', '学习', 'pedagogy', '教学'],
  psychology: ['psychology', '心理', 'behavior', '行为', 'emotion', '情绪'],
};

function markdownFiles(root) {
  if (!root || !fs.existsSync(root)) throw new Error('VAULT_PATH is not configured or does not exist');
  const files = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
    }
  };
  walk(root);
  return files;
}

function countMatches(text, terms) {
  const lower = text.toLowerCase();
  return terms.reduce((sum, term) => {
    const normalized = term.toLowerCase();
    if (/^[a-z0-9 ]+$/i.test(normalized)) {
      const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return sum + (lower.match(new RegExp(`\\b${escaped}\\b`, 'g')) || []).length;
    }
    return sum + (lower.split(normalized).length - 1);
  }, 0);
}

function characteristic(id, label, description, confidence, rationale) {
  return { id, label, description, confidence: Number(confidence.toFixed(2)), rationale, approved: true };
}

function inferProfile(texts) {
  const corpus = texts.join('\n');
  const chars = Math.max(corpus.length, 1);
  const sentences = corpus.split(/[。！？!?\.]+/).map(s => s.trim()).filter(Boolean);
  const questionCount = countMatches(corpus, ['?', '？', '为什么', 'what if', 'how might']);
  const contrastCount = countMatches(corpus, ['但是', '然而', 'but', 'however', 'on the other hand', '与此同时']);
  const hedgeCount = countMatches(corpus, ['可能', '也许', '不确定', 'perhaps', 'maybe', 'uncertain']);
  const analogyCount = countMatches(corpus, ['像', '如同', '仿佛', 'analog', 'metaphor', 'as if']);
  const actionCount = countMatches(corpus, ['下一步', '试试', '实验', 'prototype', '行动', '测试', 'iterate']);
  const humorCount = countMatches(corpus, ['哈哈', 'lol', '荒谬', '离谱', '好笑', '讽刺', 'funny']);
  const avgSentence = sentences.length ? chars / sentences.length : 0;

  const densityConfidence = n => Math.min(0.94, 0.45 + Math.log10(n + 1) * 0.18 + Math.min(texts.length / 500, 0.2));
  const dimensions = { reasoning: [], knowledge: [], voice: [], judgment: [] };

  if (questionCount) dimensions.reasoning.push(characteristic(
    'reasoning-reframe', 'Reframe before solving',
    'Often tests the premise of a question and looks for a more useful framing before accepting the obvious problem definition.',
    densityConfidence(questionCount), `Questioning and reframing markers recur across an aggregate corpus of ${texts.length} notes.`));
  if (contrastCount || hedgeCount) dimensions.reasoning.push(characteristic(
    'reasoning-ambiguity', 'Hold competing readings',
    'Treats ambiguity as useful information, compares plausible interpretations, and states uncertainty without letting it stop the response.',
    densityConfidence(contrastCount + hedgeCount), 'Contrast and uncertainty markers appear repeatedly at corpus level.'));
  if (analogyCount) dimensions.reasoning.push(characteristic(
    'reasoning-analogy', 'Think through analogy',
    'Uses cross-domain analogy to make an abstract idea concrete, while checking where the analogy stops being reliable.',
    densityConfidence(analogyCount), 'Analogy markers recur in the writing sample.'));

  const domainScores = Object.entries(DOMAIN_LEXICON)
    .map(([domain, terms]) => ({ domain, score: countMatches(corpus, terms) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  for (const item of domainScores) {
    dimensions.knowledge.push(characteristic(
      `knowledge-${item.domain.replace(/\W+/g, '-')}`, item.domain,
      `Frequently reasons with general concepts from ${item.domain}; use public, broadly known ideas from this domain without implying access to private sources.`,
      densityConfidence(item.score), `Domain vocabulary appears ${item.score} times in aggregate; no source titles or passages retained.`));
  }
  if (domainScores.length >= 2) dimensions.knowledge.push(characteristic(
    'knowledge-bridges', 'Interdisciplinary bridges',
    `Often builds bridges between ${domainScores.slice(0, 3).map(d => d.domain).join(', ')} instead of treating them as isolated subjects.`,
    Math.min(...domainScores.slice(0, 3).map(d => densityConfidence(d.score))), 'Co-occurring domain vocabulary supports this higher-level relationship.'));

  dimensions.voice.push(characteristic(
    'voice-rhythm', avgSentence < 45 ? 'Compact cadence' : 'Layered cadence',
    avgSentence < 45
      ? 'Prefers compact sentences, clear turns, and a conversational rhythm over long formal exposition.'
      : 'Uses a mix of developed sentences and short pivots, allowing a thought to unfold before landing on a concise point.',
    Math.min(0.93, 0.55 + Math.min(sentences.length / 2000, 0.35)), `Inferred from aggregate sentence-length statistics (${Math.round(avgSentence)} characters per sentence).`));
  if (humorCount) dimensions.voice.push(characteristic(
    'voice-humor', 'Dry pressure-release humor',
    'Uses occasional dry or slightly absurd humor to release pressure, not to dodge the substance of an idea.',
    densityConfidence(humorCount), 'Humor markers recur in the aggregate corpus.'));
  const cjk = (corpus.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (corpus.match(/[A-Za-z]/g) || []).length;
  if (cjk && latin) dimensions.voice.push(characteristic(
    'voice-bilingual', 'Natural bilingual vocabulary',
    'Can mix Chinese and English terms when the borrowed term is more precise, while keeping the overall response easy to follow.',
    Math.min(0.92, 0.5 + Math.min(cjk, latin) / chars), 'Both Chinese and English appear throughout the aggregate corpus.'));

  dimensions.judgment.push(characteristic(
    'judgment-specificity', 'Specificity over applause',
    'Finds an idea more interesting when its hidden assumption, mechanism, or concrete consequence can be named; avoids generic praise.',
    densityConfidence(questionCount + contrastCount), 'Supported by recurring questioning and contrast patterns.'));
  if (actionCount) dimensions.judgment.push(characteristic(
    'judgment-experiment', 'Prefer a revealing experiment',
    'When discussion stops producing new information, prefers a small experiment or prototype that can reveal what the idea is actually made of.',
    densityConfidence(actionCount), 'Action, experiment, and iteration vocabulary recurs in aggregate.'));

  return dimensions;
}

function refreshFromVault(vaultPath) {
  const files = markdownFiles(vaultPath);
  const texts = files.map(file => fs.readFileSync(file, 'utf8').replace(/^---[\s\S]*?---\s*/m, ''));
  const version = `draft-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const profile = {
    schemaVersion: 1,
    version,
    status: 'draft',
    createdAt: new Date().toISOString(),
    methodVersion: METHOD_VERSION,
    analysis: { noteCount: texts.length, characterCount: texts.reduce((sum, text) => sum + text.length, 0), mode: 'local-only' },
    dimensions: inferProfile(texts),
  };

  const hashes = new Set();
  for (const text of texts) for (const hash of hashShingles(text, 8)) hashes.add(hash);
  store.saveFingerprints({ algorithm: 'sha256-8-token-shingles', shingleSize: 8, generatedAt: new Date().toISOString(), hashes: [...hashes] });
  return store.saveDraft(profile);
}

module.exports = { refreshFromVault, inferProfile, METHOD_VERSION };
