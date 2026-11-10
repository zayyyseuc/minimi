# Zai Vending Machine architecture

## Public-source architecture

Personal Brain remains a local Express application, but the public Vending Machine now has a separate deployment entry. Its only personal context is the committed, owner-reviewed `config/public-zai-profile.json`, distilled from the supplied résumé, portfolio PDF, and public portfolio website. Phone numbers, personal email addresses, residential details, private relationships, vault notes, and unsupported inferences are excluded.

The Vercel functions import `src/vending/public-api.js`, `generator.js`, privacy helpers, and the sanitized profile. They do not import `server.js`, Vectra, the watcher, the indexer, or the vault searcher.

## Privacy boundary

```text
OWNER SOURCES                                  PUBLIC DEPLOYMENT

résumé ───────────┐
portfolio PDF ────┼─► manual fact review + contact removal
portfolio website┘                 │
                                   ▼
                      config/public-zai-profile.json
                                   │
visitor input ───────────────► product prompt ─► SiliconFlow LLM
                                   │
                                   ▼
                     answer + behavior trace + fact trace
```

The public generation path never queries the vault. It can state only the bounded facts in the public JSON profile. Each model response returns exact behavioral-trait IDs and zero to three exact public-fact IDs. The server validates those IDs before the interface displays them, so invented trace labels cannot appear as grounding.

The public profile is deliberately safe to deploy and contains no raw résumé or PDF file. Local draft profiles and any legacy vault fingerprints remain under the gitignored `data/` directory and are not part of the Vercel build.

## Curation lifecycle

1. Read the owner-provided résumé, portfolio PDF, and published portfolio pages.
2. Reconcile overlapping facts and avoid disputed or stale claims where the sources conflict.
3. Remove contact and location details and keep only public work, education, skills, awards, and approved links.
4. Encode bounded facts and abstract practice traits in `config/public-zai-profile.json`.
5. Run tests that reject known contact details, local file paths, and private-runtime imports.

Prompt changes, public-profile changes, behavioral-profile changes, and the underlying model (`VENDING_MODEL`) are separately identified in responses.

## Answer grounding

The behavioral dimensions control how the machine reasons. The fact records cover five published projects plus bounded education and award information. Questions about Zai must use at least one fact record. Subjective questions are answered as analytical selections rather than falsely presented as Zai's documented favorite or personal belief.

## Public deployment

Do not expose the default Personal Brain server to the internet. Vercel instead builds only `public/vending/` into `dist/` and deploys the two files under `api/vending/`.

Required Vercel environment:

```env
SILICONFLOW_API_KEY=...
VENDING_MODEL=deepseek-ai/DeepSeek-V4-Flash
VENDING_RATE_LIMIT=24
```

`SILICONFLOW_API_KEY` is read lazily inside generation, so a missing key causes a clear `503` from the dispense function rather than crashing the whole site. The status function and static interface still load. Do not configure or deploy `VAULT_PATH`, `INDEX_PATH`, owner tokens, `.env`, vector indexes, or vault files.

## Evaluation

Automated tests cover prompt-injection interception, bounded request validation, the complete five-project allowlist, removal of known contact details and local paths, clean startup without a model key, and the absence of retrieval/profile-store dependencies in the public generator. A live regression question verifies that a project answer names a real published project and returns a validated fact trace.

## Known limits

- This is prompt-grounded generation from curated public facts, not model training or fine-tuning.
- Source updates are manual. A changed résumé or portfolio requires reviewing and updating the public JSON profile.
- A validated fact ID proves which allowlisted record the model selected; it does not independently verify the underlying résumé claim.
- Subjective questions can receive an analytical selection, but the machine must not label it as Zai's documented favorite unless a source explicitly says so.
- In-memory rate limiting is suitable for a single-process MVP. A multi-instance production deployment should use a shared rate-limit store and trusted proxy configuration.
