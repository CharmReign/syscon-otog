# Syscon OneTeamOneGoal

Internal knowledge, learning and engineering support in one app. Next.js 15 (App Router, JavaScript), Tailwind + shadcn/ui, TanStack Query.

| Section | What it does | Data source |
|---|---|---|
| **Level Up: Product & Support** (home) | Admins upload documents → text is extracted with page/section references → quizzes are generated, reviewed, edited and published → everyone takes them, gets scored, reviews answers, sees history, badges and a leaderboard | Local store |
| **Client Defect Triage** | Agents paste a client email or chat (with screenshots or video). The closest references (team library, documents, Jira, Confluence) are found by keyword, and Claude drafts a cited reply with steps to unblock the client, or a holding reply when nothing covers it, plus a Jira ticket draft for new defects. Every reply is reviewed, approved and marked sent by a person. Results tab tracks deflection against a baseline; Jira defects tab lists reported defects with related docs | Local store + docs + Confluence + Jira (read-only); Claude for drafting |
| **AS-IS Navigator** | Analysis projects that build a versioned AS-IS knowledge base: intake, documents and Confluence/Jira references go through an AI analysis (current state, stakeholders, rules, classified findings, gaps, decisions, questions); new knowledge is compared with what is known and shown as "What changed?". Plus one search across system documentation, Confluence and Jira | Local store + docs + Confluence + Jira; Claude for analysis |
| **Release Sanity Health Check** | Admin-defined checklist templates; releases record Pass / Fail / Blocked / Pending, findings, Jira keys and links; readiness and risk summary | Local store |
| **Confluence Hub** (external) | Search pages, read them in-app, open the original | Confluence REST |
| **Jira Tickets** (external) | Search by keyword, key, project, status; view issue details | Jira REST |

Roles: `EMPLOYEE` and `ADMIN`. Both can use every module. Only admins can upload quiz sources, generate/edit/publish quizzes, see everyone's results, edit checklist templates, and test integration connections. Every rule is enforced in the API, not just hidden in the UI.

## Run it

```bash
npm install
cp .env.example .env.local      # optional; everything works without it locally
npm run dev                     # http://localhost:3000
```

Sign in with the demo accounts **employee / demo1234** or **admin / demo1234** (created automatically outside production; see `SEED_DEMO_USERS`, `DEMO_PASSWORD`).

```bash
npm test          # vitest: auth, documents, quizzes, integrations (mocked), releases
npm run build     # production build
npm start
```

Production needs at least `SESSION_SECRET` and a persistent `DATA_DIR`. See `.env.example` for every setting.

## Architecture

```
Browser ── fetch /api/* (httpOnly session cookie) ──► Route handlers (app/api)
                                                     │  requireUser / requireAdmin (lib/server/auth.js)
                                                     ├─ lib/server/documents/   validate → extract (unpdf, mammoth) → sections
                                                     ├─ lib/server/quiz/        generator (ai | offline) → validation → lifecycle, scoring
                                                     ├─ lib/server/releases.js  templates, releases, checks
                                                     ├─ lib/server/knowledge.js unified search (docs + Confluence + Jira)
                                                     ├─ lib/server/asis/        AS-IS projects: analysis (Claude) → findings, decisions, versions
                                                     ├─ lib/server/triage/      client queries: reference search → draft (Claude) → review
                                                     ├─ lib/server/ai.js        shared Claude client (quiz writing, AS-IS analysis, triage)
                                                     ├─ lib/server/integrations/ ConfluenceClient, JiraClient, shared HTTP/errors
                                                     └─ lib/server/store.js     JSON store in DATA_DIR (atomic writes)
DATA_DIR/db.json        metadata: users, documents, quizzes, attempts, releases, audit log
DATA_DIR/uploads/       original files, named by server id
DATA_DIR/content/       extracted sections per document
```

- **Storage.** `lib/server/store.js` persists to one JSON file with a `schemaVersion` and a migration hook. That suits a single-instance internal deployment. For several instances, swap the store functions for MongoDB (the driver is already a dependency); callers only use `findAll/findOne/insertOne/updateOne/deleteOne`.
- **Quiz generation** sits behind one provider interface (`lib/server/quiz/generator.js`). The *offline* provider (from steep) needs no external service. The *AI* provider (Claude, `ANTHROPIC_API_KEY`) must quote a sentence from the cited section for every question; questions whose quote isn't found in the source are discarded. Document text is treated as untrusted data in the prompt. If the AI call fails, generation falls back to offline and says so.
- **AS-IS analysis** (`lib/server/asis/`) needs `ANTHROPIC_API_KEY`; without it, projects, findings and decisions still work by hand. Sources are untrusted data in the prompt. Certainty rules are enforced in code, not left to the model: only a person or new knowledge classified *Confirmed* can confirm or supersede a finding; anything else that contradicts a finding marks it *Conflicting* for review. Re-running the initial analysis replaces AI findings but keeps hand-written ones.
- **Client Defect Triage** (`lib/server/triage/`) sends Claude only the few best-matching references (at most 6, about 900 characters each) and the client's attachments. Screenshots are shrunk to JPEG in the browser and each video becomes 3 stills, so only small images are stored and sent. If nothing matches, it drafts a holding reply without any AI call. A How-to, Expected behaviour or Known issue answer that cites no reference becomes a holding reply, and cited ids must be ones Claude was given. The module never sends replies and never writes to Jira.
- **Grounding and review.** Every question keeps `sourceSectionId` and `sourceQuote`. `lib/quiz-validation.js` (shared by server and editor) blocks publishing until each question has a valid correct answer, distinct options, an explanation and a source. Quizzes are drafts until an admin publishes (unless `QUIZ_AUTO_PUBLISH=true`). Published quizzes must be unpublished before editing.
- **Answers stay server-side.** Learners receive questions without answers. Scoring happens on the server, and attempts store a snapshot so history survives quiz edits. `SCORE_ONLY` quizzes never reveal correct answers.
- **Integrations** are read-only and call Atlassian only from the server. Cloud uses Basic auth with an API token; Data Center uses a PAT bearer token. Jira Cloud uses `/rest/api/3/search/jql` (token pagination); Data Center uses `/rest/api/2/search` (startAt). User input is quoted into CQL/JQL; the defect filter comes from server config. Timeouts, a single `Retry-After`-aware retry on 429/503, and mapped errors (`NOT_CONFIGURED`, `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `TIMEOUT`…) are handled; credentials never appear in logs or responses. An integration is shown as **Connected** only after an admin's connection test succeeds.

## Supported documents

PDF (text layer), DOCX, TXT, Markdown, up to `MAX_UPLOAD_MB` (10 MB default). Files are checked by extension and content signature. Scanned PDFs, empty, corrupt, binary or non-UTF-8 files get a specific error, and failed documents are recorded as `FAILED` with the reason. PPTX and OCR aren't supported yet.

## Known limitations

- Sign-in uses local accounts (scrypt-hashed). Connect SSO before company-wide rollout; only `lib/server/auth.js` needs to change.
- There's no UI for managing users yet. Users live in `DATA_DIR/db.json` (`role`: `EMPLOYEE` | `ADMIN`).
- The AI quiz path, AS-IS analysis, triage drafting and live Atlassian calls have only been tested with mocked responses. Verify them with real credentials and the **Test connection** button in Settings.
- Document processing runs inside the upload request. Very large files would need a background job queue.
