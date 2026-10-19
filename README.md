# Syscon OneTeamOneGoal

Internal knowledge, learning and engineering support in one app. Next.js 15 (App Router, JavaScript), Tailwind + shadcn/ui, TanStack Query.

| Section | What it does | Data source |
|---|---|---|
| **Level Up: Product & Support** (home) | Admins upload documents → text is extracted with page/section references → quizzes are generated, reviewed, edited and published → everyone takes them, gets scored, reviews answers, sees history, badges and a leaderboard | Local store |
| **Client Defect Triage** | Agents paste a client email or chat (with screenshots or video). The closest references (team library, documents, Jira, Confluence) are found by keyword, and Claude drafts a cited reply with steps to unblock the client, or a holding reply when nothing covers it, plus a Jira ticket draft for new defects. Every reply is reviewed, approved and marked sent by a person. Results tab tracks deflection against a baseline; Jira defects tab lists reported defects with related docs | Local store + docs + Confluence + Jira (read-only); Claude for drafting |
| **AS-IS Navigator** | Analysis projects with a versioned AS-IS knowledge base. The intake (documents, Excel, PowerPoint, screenshots, pasted email/Teams content, Confluence/Jira references) creates the baseline (v1.0); Add knowledge adds versions and records what changed. Findings are classified by certainty; decisions and questions live in an open-items register. Super-Agent 2 then drafts the TO-BE process, traced to every pain point and gap, flags steps that rest on unconfirmed information, and downloads it as Word (standard layout, or written into the team's own template). A demo script answers every AI step for rehearsals. Plus one search across system documentation, Confluence and Jira | Local store + docs + Confluence + Jira; Claude for analysis and design |
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

Sign in with the built-in accounts **sysconadmin / syscon123** (admin) or **sysconuser / syscon123** (employee). They're listed on the login screen and created automatically in every environment; set `SEED_DEMO_USERS=false` once real accounts exist.

```bash
npm test          # vitest: auth, documents, quizzes, integrations (mocked), releases
npm run build     # production build
npm start
```

Production needs at least `SESSION_SECRET` and persistent storage: either `MONGODB_URI` or a persistent `DATA_DIR`. See `.env.example` for every setting.

For Jira and Confluence Cloud scoped tokens, see [Atlassian integration setup](docs/atlassian-integration.md) for exact API paths, token scopes, Cloud IDs and acceptance checks. Site URLs and API gateway URLs are kept separate.

## Deploy to Vercel

**Without a database (trying it out).** Only `SESSION_SECRET` is required. Import the repository in Vercel (framework preset: Next.js, default settings), add `SESSION_SECRET` (output of `openssl rand -base64 32`) under **Settings → Environment Variables**, and deploy. Visitors sign in with the built-in accounts shown on the login screen. Data then lives in each server instance's temporary folder: it is **lost** whenever Vercel starts a new instance (after a redeploy or some idle time) and isn't shared between instances, so a quiz uploaded a moment ago may not show up on the next request. Sign-in keeps working throughout, because the built-in accounts are recreated on every instance with the same ids.

**With MongoDB (keeps data).** Vercel's filesystem is read-only and not shared between function instances, so anything that must persist needs MongoDB (any MongoDB 6+; MongoDB Atlas has a free tier and a Vercel Marketplace integration that sets `MONGODB_URI` for you).

1. Create a MongoDB database. In Atlas, allow access from Vercel (Network Access → `0.0.0.0/0`, or use the Vercel integration).
2. Import the repository in Vercel (framework preset: Next.js; the defaults for build command and output are right).
3. Under **Settings → Environment Variables**, set at least:
   - `MONGODB_URI`: the connection string (optionally `MONGODB_DB`, default `otog`)
   - `SESSION_SECRET`: output of `openssl rand -base64 32`
   - optionally `ANTHROPIC_API_KEY`, and the Confluence/Jira settings from `.env.example`
4. Deploy. Collections are created on first use.

Limits on Vercel: request bodies are capped at 4.5 MB, so document uploads default to 4 MB (`MAX_UPLOAD_MB`) and a triage query or AS-IS analysis must keep all its attachments together under 4.5 MB. AI routes declare `maxDuration` up to 300 s; with Fluid compute (the default) that works on every plan.

To run the tests against MongoDB instead of the file store: `TEST_MONGODB_URI=mongodb://localhost:27017 npm test`.

## Architecture

```
Browser ── fetch /api/* (httpOnly session cookie) ──► Route handlers (app/api)
                                                     │  requireUser / requireAdmin (lib/server/auth.js)
                                                     ├─ lib/server/documents/   validate → extract (unpdf, mammoth) → sections
                                                     ├─ lib/server/quiz/        generator (ai | offline) → validation → lifecycle, scoring
                                                     ├─ lib/server/releases.js  templates, releases, checks
                                                     ├─ lib/server/knowledge.js unified search (docs + Confluence + Jira)
                                                     ├─ lib/server/asis/        AS-IS projects: analysis + TO-BE design (Claude or demo script), Word export
                                                     ├─ lib/server/triage/      client queries: reference search → draft (Claude) → review
                                                     ├─ lib/server/ai.js        shared Claude client (quiz writing, AS-IS analysis, triage)
                                                     ├─ lib/server/integrations/ ConfluenceClient, JiraClient, shared HTTP/errors
                                                     └─ lib/server/store.js     MongoDB (MONGODB_URI) or JSON store in DATA_DIR
DATA_DIR/db.json        metadata: users, documents, quizzes, attempts, releases, audit log
DATA_DIR/uploads/       original files, named by server id
DATA_DIR/content/       extracted sections per document
```

- **Storage.** `lib/server/store.js` and `lib/server/files.js` have two backends behind the same async functions (`findAll/findOne/insertOne/updateOne/deleteOne/deleteWhere`, `saveUpload/readUpload/…`). With `MONGODB_URI` set, each record is a MongoDB document (`_id` = record id), uploads go to the `uploads` collection and extracted text, gzipped, to `contents`. Use this for Vercel or any multi-instance deployment. Without it, everything is kept in one JSON file (with a `schemaVersion` and migration hook) plus the upload and content folders in `DATA_DIR`, which suits local development and a single-instance server.
- **Quiz generation** sits behind one provider interface (`lib/server/quiz/generator.js`). The *offline* provider (from steep) needs no external service. The *AI* provider (Claude, `ANTHROPIC_API_KEY`) must quote a sentence from the cited section for every question; questions whose quote isn't found in the source are discarded. Document text is treated as untrusted data in the prompt. If the AI call fails, generation falls back to offline and says so.
- **AS-IS Navigator** (`lib/server/asis/`, shared logic in `lib/asis.js` and `lib/asis-design.js`). Live Claude needs `ANTHROPIC_API_KEY`; the *Demo script* mode (chosen per browser) answers every AI step from a fictional sample, needs no key and marks what it produced. Sources are untrusted data in the prompt. Certainty rules are enforced in code, not left to the model: only a person or new knowledge classified *Confirmed* can confirm or supersede a finding or answer a question for good; anything else that contradicts a finding marks it *Conflicting*, and answers from it are recorded as *Pending*. The baseline is created once; later information goes through Add knowledge, so edits are never overwritten. The TO-BE design records which knowledge base items each step relies on and re-checks their status live, so a step is flagged as soon as something it depends on is no longer confirmed. The standard Word document is built on the server (`docx`); a BA's own template is read and filled in the browser (`lib/asis-template.js`, it needs the browser's XML DOM) with section content the server writes batch by batch and caches until the design or knowledge base changes. Projects saved before this version are upgraded when first opened.
- **Client Defect Triage** (`lib/server/triage/`) sends Claude only the few best-matching references (at most 6, about 900 characters each) and the client's attachments. Screenshots are shrunk to JPEG in the browser and each video becomes 3 stills, so only small images are stored and sent. If nothing matches, it drafts a holding reply without any AI call. A How-to, Expected behaviour or Known issue answer that cites no reference becomes a holding reply, and cited ids must be ones Claude was given. The module never sends replies and never writes to Jira.
- **Grounding and review.** Every question keeps `sourceSectionId` and `sourceQuote`. `lib/quiz-validation.js` (shared by server and editor) blocks publishing until each question has a valid correct answer, distinct options, an explanation and a source. Quizzes are drafts until an admin publishes (unless `QUIZ_AUTO_PUBLISH=true`). Published quizzes must be unpublished before editing.
- **Answers stay server-side.** Learners receive questions without answers. Scoring happens on the server, and attempts store a snapshot so history survives quiz edits. `SCORE_ONLY` quizzes never reveal correct answers.
- **Integrations** are read-only and call Atlassian only from the server. Cloud uses Basic auth with an API token; scoped tokens use a Cloud ID and the `api.atlassian.com` gateway, while classic tokens use the site API. Data Center uses a PAT bearer token. Jira Cloud uses `/rest/api/3/search/jql` (token pagination); Data Center uses `/rest/api/2/search` (startAt). Confluence Cloud uses v1 search and v2 page/blog-post reads; Data Center retains v1 content reads. User input is quoted into CQL/JQL; the defect filter comes from server config. Timeouts, a single `Retry-After`-aware retry on 429/503, and mapped errors (`NOT_CONFIGURED`, `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `TIMEOUT`…) are handled; credentials never appear in logs or responses. An integration is shown as **Connected** only after an admin's connection test succeeds; changing configuration invalidates that result.

## Supported documents

PDF (text layer), DOCX, TXT, Markdown, up to `MAX_UPLOAD_MB` (10 MB default). Files are checked by extension and content signature. Scanned PDFs, empty, corrupt, binary or non-UTF-8 files get a specific error, and failed documents are recorded as `FAILED` with the reason. PPTX and OCR aren't supported yet.

## Known limitations

- Sign-in uses local accounts (scrypt-hashed). Connect SSO before company-wide rollout; only `lib/server/auth.js` needs to change.
- There's no UI for managing users yet. Users live in `DATA_DIR/db.json` (`role`: `EMPLOYEE` | `ADMIN`).
- The AI quiz path, AS-IS analysis, triage drafting and live Atlassian calls have only been tested with mocked responses. Verify them with real credentials and the **Test connection** button in Settings.
- Document processing runs inside the upload request. Very large files would need a background job queue.
