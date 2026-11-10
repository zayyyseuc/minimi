const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../data/vending');
const DRAFT_DIR = path.join(ROOT, 'drafts');
const APPROVED_DIR = path.join(ROOT, 'approved');
const ACTIVE_FILE = path.join(ROOT, 'active-profile.json');
const FINGERPRINT_FILE = path.join(ROOT, 'private', 'vault-fingerprints.json');
const SHOWCASE_FILE = path.join(ROOT, 'active-showcase.json');

const DIMENSIONS = ['reasoning', 'knowledge', 'voice', 'judgment'];

function ensureDirs() {
  for (const dir of [DRAFT_DIR, APPROVED_DIR, path.dirname(FINGERPRINT_FILE)]) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writePrivateJson(file, data) {
  ensureDirs();
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
  try { fs.chmodSync(file, 0o600); } catch {}
}

function listFiles(dir) {
  ensureDirs();
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .sort()
    .reverse();
}

function saveDraft(profile) {
  writePrivateJson(path.join(DRAFT_DIR, `${profile.version}.json`), profile);
  return profile;
}

function getDraft(version) {
  return readJson(path.join(DRAFT_DIR, `${path.basename(version)}.json`));
}

function listDrafts() {
  return listFiles(DRAFT_DIR).map(name => {
    const profile = readJson(path.join(DRAFT_DIR, name), {});
    return summarize(profile);
  });
}

function saveApproved(profile) {
  const file = path.join(APPROVED_DIR, `${profile.version}.json`);
  writePrivateJson(file, profile);
  writePrivateJson(ACTIVE_FILE, profile);
  return profile;
}

function getApproved(version) {
  return readJson(path.join(APPROVED_DIR, `${path.basename(version)}.json`));
}

function getActive() {
  return readJson(ACTIVE_FILE);
}

function listApproved() {
  return listFiles(APPROVED_DIR).map(name => summarize(readJson(path.join(APPROVED_DIR, name), {})));
}

function activateApproved(version) {
  const profile = getApproved(version);
  if (!profile) return null;
  writePrivateJson(ACTIVE_FILE, profile);
  return profile;
}

function saveFingerprints(data) {
  writePrivateJson(FINGERPRINT_FILE, data);
}

function getFingerprints() {
  return readJson(FINGERPRINT_FILE, { algorithm: 'sha256-8-token-shingles', hashes: [] });
}

function saveShowcase(showcase) {
  writePrivateJson(SHOWCASE_FILE, showcase);
  return showcase;
}

function getShowcase() {
  return readJson(SHOWCASE_FILE, { schemaVersion: 1, updatedAt: null, items: [] });
}

function summarize(profile) {
  return {
    version: profile.version,
    status: profile.status,
    createdAt: profile.createdAt,
    approvedAt: profile.approvedAt,
    sourceProfileVersion: profile.sourceProfileVersion,
    methodVersion: profile.methodVersion,
    characteristicCount: DIMENSIONS.reduce((sum, key) => sum + (profile.dimensions?.[key]?.length || 0), 0),
  };
}

module.exports = {
  DIMENSIONS,
  saveDraft,
  getDraft,
  listDrafts,
  saveApproved,
  getApproved,
  getActive,
  listApproved,
  activateApproved,
  saveFingerprints,
  getFingerprints,
  saveShowcase,
  getShowcase,
};
