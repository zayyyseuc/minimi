# Zai Vending Machine architecture

## Existing system audit

Personal Brain is a single Express process with a buildless vanilla JavaScript client. `src/indexer.js` walks the private vault, sends chunks to SiliconFlow for embeddings, and stores raw chunk text plus source paths in a local Vectra index. `src/searcher.js` retrieves those chunks and places their text directly in the Personal Brain chat prompt. `src/server.js` also contains owner-oriented routes that read and write vault material. The Mom PWA has a separate index but still belongs to the existing private application.

Those paths are appropriate for the local owner experience, but they are not a safe dependency for a public vending agent. They remain intact and are not imported by the Vending Machine generator.

## Privacy boundary

```text
PRIVATE / OWNER                                   PUBLIC

Obsidian vault
      │
      ▼
local heuristic analysis ──► private draft
      │                          │ owner edits / approves
      │                          ▼
      └─► hashed 8-token      sanitized approved profile
          fingerprints             │
          (no plaintext)            ├──────────────┐
                                    ▼              ▼
visitor input ─────────────────► product prompt ► SiliconFlow LLM
                                    │
                                    ▼
                              structured artifact
                                    │
                                    ▼
                          hashed overlap check ──► public response
```

The public generation path imports `generator.js`, `profile-store.js`, and privacy helpers. It does not import Vectra, `searcher.js`, or `indexer.js`; it never queries the vault. The only personal context in its model call is the currently active approved profile. Draft rationales, note counts, fingerprints, evaluations, and profile history stay under the gitignored `data/vending` directory with restrictive file modes.

The overlap detector compares SHA-256 hashes of normalized eight-token sequences. It adds a useful exact-overlap tripwire without making raw passages available to the generator. It cannot prove that semantic reconstruction is impossible and should not be described as a confidentiality guarantee.

## Learning lifecycle

1. `POST /api/vending/owner/learn` runs local deterministic analysis over the vault. No raw note text is sent to an LLM.
2. A private draft records abstract traits, confidence, and aggregate rationale.
3. The owner reviews each trait at `/vending-owner/`, edits or rejects it, and explicitly approves a version.
4. Approval runs a strict sanitizer. Only `id`, `label`, `description`, and `confidence` survive.
5. The approved version becomes active. Any previous approved version can be reactivated.

Learning method changes (`local-heuristics-v1`), behavioral prompt changes (`vending-products-v2`), profile changes, and the underlying model (`VENDING_MODEL`) are separately identified.

## Owner-approved public showcase

The behavioral profile controls how the machine reasons; it deliberately contains no project history. Real project questions use a second, manually maintained allowlist at `/vending-owner/`. Each public showcase item contains only an owner-approved title, description, explanation, and broad tags. If this list is empty, personal-history questions receive a concise boundary response in the visitor's language instead of a fabricated answer or an irrelevant product critique. The private vault is never searched to answer these questions.

## Public deployment

Do not expose the default Personal Brain server to the internet. Its existing routes intentionally support raw note access and owner mutations.

For a vending-only deployment set:

```env
PUBLIC_VENDING_ONLY=true
SILICONFLOW_API_KEY=...
VENDING_MODEL=deepseek-ai/DeepSeek-V4-Flash
VENDING_RATE_LIMIT=24
```

`PUBLIC_VENDING_ONLY=true` returns 404 for every API except `/api/vending/status` and `/api/vending/dispense`, including all owner learning operations. Prepare and approve a profile locally, then deploy only the required active profile data through a secure deployment mechanism. Do not deploy drafts, evaluations, fingerprints, vault paths, `.env`, the vector index, or the vault.

## Evaluation

The owner Behavior Lab calls the same input and product configuration against:

- Generic: no behavioral profile.
- Basic: a compact non-personal persona.
- Learned: the active approved behavioral profile.

Each run records its input, output, prompt version, profile version, and timestamp in private JSONL. The automated tests cover profile sanitization, source-field rejection, hashed-overlap detection, prompt-injection interception, bounded request validation, and the absence of retrieval dependencies in the public generator.

## Known limits

- The local analyzer is deliberately inspectable and conservative; it is statistical heuristics, not model training or fine-tuning.
- Confidence scores are evidence-strength estimates, not psychological certainty.
- Keyword-based domain inference can miss implicit interests or overcount ambiguous terms.
- Shingle checks catch substantial verbatim overlap, not paraphrased disclosure. Architectural non-retrieval is the primary protection.
- In-memory rate limiting is suitable for a single-process MVP. A multi-instance production deployment should use a shared rate-limit store and trusted proxy configuration.
