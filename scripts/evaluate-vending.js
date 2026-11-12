const fs = require('fs');
const path = require('path');

const { startConversation, continueConversation } = require('../src/vending/conversation');

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, '../test/vending-evaluation-cases.json'), 'utf8'));
const args = process.argv.slice(2);

/** Drives the real agent with a visitor who approves every checkpoint. */
async function runAgentSession(testCase) {
  let turn = await startConversation({ input: testCase.input, product: testCase.product });
  for (let guard = 0; guard < 30 && turn.type !== 'artifact'; guard += 1) {
    let action = 'continue';
    if (turn.type === 'clarification') action = 'skip';
    else if (turn.type === 'confirmation') action = 'dispense';
    turn = await continueConversation({ stateToken: turn.stateToken, action });
  }
  if (turn.type !== 'artifact') throw new Error(`Agent did not finish for ${testCase.id}`);
  return turn;
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function languageMatches(message, language) {
  const han = (String(message).match(/[\u3400-\u9fff]/g) || []).length;
  if (language === 'zh') return han >= 4;
  return han === 0;
}

function validate(testCase, artifact) {
  const expect = testCase.expect || {};
  const factIds = new Set((artifact.factTrace || []).map(item => item.id));
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  add('non-empty', Boolean(artifact.title && artifact.message), 'title and message are required');
  if (expect.title) add('title', artifact.title === expect.title, `expected ${expect.title}`);
  if (expect.language) add('language', languageMatches(artifact.message, expect.language), `expected ${expect.language}`);
  if (expect.maxWords) add('length', wordCount(artifact.message) <= expect.maxWords, `${wordCount(artifact.message)}/${expect.maxWords} words`);
  if (expect.factIdsAll) add('required facts', expect.factIdsAll.every(id => factIds.has(id)), `expected all: ${expect.factIdsAll.join(', ')}`);
  if (expect.factIdsAny) add('supporting fact', expect.factIdsAny.some(id => factIds.has(id)), `expected one of: ${expect.factIdsAny.join(', ')}`);
  if (expect.exclude) {
    const lower = String(artifact.message).toLowerCase();
    const found = expect.exclude.filter(phrase => lower.includes(phrase.toLowerCase()));
    add('banned phrasing', found.length === 0, found.length ? `found: ${found.join(', ')}` : 'none found');
  }

  return checks;
}

async function main() {
  const category = option('--category');
  const caseId = option('--case');
  const limit = Number(option('--limit') || cases.length);
  const repeat = Math.max(1, Number(option('--repeat') || 1));
  const selected = cases
    .filter(item => !category || item.category === category)
    .filter(item => !caseId || item.id === caseId)
    .slice(0, limit);

  if (!selected.length) throw new Error('No evaluation cases matched the supplied filters.');

  const results = [];
  for (const testCase of selected) {
    for (let run = 1; run <= repeat; run += 1) {
      const artifact = await runAgentSession(testCase);
      const checks = validate(testCase, artifact);
      results.push({
        id: testCase.id,
        category: testCase.category,
        run,
        pass: checks.every(check => check.pass),
        checks,
        output: { title: artifact.title, message: artifact.message, factTrace: artifact.factTrace || [], agent: artifact.agent || null },
      });
      console.log(`${checks.every(check => check.pass) ? 'PASS' : 'FAIL'} ${testCase.id} run ${run}`);
    }
  }

  const passed = results.filter(item => item.pass).length;
  console.log(JSON.stringify({ summary: { passed, total: results.length }, results }, null, 2));
  if (passed !== results.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
