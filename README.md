# AI-generated Cucumber Test Project

**Jira ticket in → Cucumber tests out → Developer only reviews the PR.**

This system watches Jira for stories marked ready for automation, uses an LLM to generate Gherkin features + Playwright step definitions, opens a draft PR, comments back on the ticket, and runs tests in CI after merge. The only human step is reviewing and approving the generated code.

```
┌─────────┐    webhook/poll     ┌──────────────┐    LLM     ┌─────────────┐
│  Jira   │ ──────────────────► │  Orchestrator │ ────────► │  Generator  │
└─────────┘                     └──────┬───────┘           └──────┬──────┘
     ▲                                 │                          │
     │ comment + status                │ write artifacts          │
     │                                 ▼                          ▼
     │                          ┌──────────────┐           features/*.feature
     └──────────────────────────│  GitHub PR   │◄────────── steps/*.steps.ts
                                └──────┬───────┘
                                       │ merge after review
                                       ▼
                                ┌──────────────┐
                                │  CI Cucumber │
                                └──────────────┘
```

## What the developer does

1. Review the draft PR (feature file + step definitions).
2. Tweak selectors if the app UI differs from assumptions.
3. Approve & merge.

Everything else is automated.

## Quick start (demo, no credentials)

**PowerShell (Windows):**
```powershell
Copy-Item .env.example .env
npm install
npx playwright install chromium
npm run pipeline:dry
npm run test:unit
npm run test:cucumber -- --tags '@framework'
```

**bash / macOS / Linux / Git Bash:**
```bash
cp .env.example .env
npm install
npx playwright install chromium
npm run pipeline:dry
npm run test:unit
npm run test:cucumber -- --tags @framework
```

> PowerShell tip: quote tags as `'@framework'` — bare `@framework` is treated as a variable.

Dry-run uses a built-in **DEMO-101** login story and writes:

- `generated/DEMO-101/features/...`
- `generated/DEMO-101/steps/...`
- mirrored copies under `tests/cucumber/` for CI

## Live setup

### 1. Environment

```bash
cp .env.example .env
```

Fill in:

| Variable | Purpose |
|---|---|
| `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN` | Read tickets, comment, transition |
| `JIRA_JQL` | Which issues to automate |
| `LLM_API_KEY` / `LLM_MODEL` | OpenAI-compatible chat API |
| `LLM_MODE` | `live` or `mock` |
| `GITHUB_TOKEN` | Open draft PRs (Actions can use `GITHUB_TOKEN`) |
| `WEBHOOK_SECRET` | Protect `/webhooks/jira` |

### 2. Jira configuration

1. Create (or reuse) a status like **Ready for Automation**.
2. Add label `cucumber-auto` (or change `JIRA_JQL`).
3. In **Jira Automation**, add a rule:

   - **Trigger:** Issue transitioned to Ready for Automation  
   - **Action:** Send web request  
     - URL: `https://<your-host>/webhooks/jira`  
     - Method: POST  
     - Header: `x-webhook-secret: <WEBHOOK_SECRET>`  
     - Body:

     ```json
     { "issueKey": "{{issue.key}}" }
     ```

   Or use GitHub `repository_dispatch` from Jira Automation against this repo (workflow `jira-automation.yml` listens for type `jira-ready-for-automation`).

### 3. Run the automation server

```bash
npm run dev
# or
docker compose up --build
```

Endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness |
| POST | `/webhooks/jira` | Jira webhook (async 202) |
| POST | `/api/run` | Sync run (`{ "issueKey": "PROJ-1" }`) |

### 4. CLI

```bash
# Single issue, open PR
npm run pipeline -- --issue PROJ-42

# Batch via JQL
npm run pipeline

# Generate files only
npm run generate -- PROJ-42
npm run pipeline -- --issue PROJ-42 --dry-run --skip-pr
```

### 5. GitHub secrets / variables

For `.github/workflows/jira-automation.yml`:

**Secrets:** `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `LLM_API_KEY`  
**Variables (optional):** `JIRA_JQL`, `LLM_MODE`, `LLM_MODEL`, `LLM_BASE_URL`, `BASE_URL`

## Project layout

```
src/
  jira/          # Jira REST client
  generator/     # LLM → Cucumber artifacts
  git/           # Write files + open draft PRs
  pipeline/      # End-to-end orchestration
  server/        # Webhook + optional poller
  cli/           # pipeline / generate commands
tests/cucumber/
  features/      # Gherkin (generated + framework smoke)
  steps/         # Playwright step defs
  support/       # CustomWorld, shared hooks
generated/       # Per-issue manifests + copies
.github/workflows/
  cucumber.yml           # Run tests on PR/main
  jira-automation.yml    # Generate from Jira
```

## How generation works

1. Load Jira issue (summary, description, acceptance criteria).
2. Prompt the LLM for JSON: feature file(s) + TypeScript step definitions.
3. Validate paths (`features/` / `steps/` only) and write artifacts.
4. Push branch `auto/cucumber-<issue-key>` and open a **draft PR**.
5. Comment on the Jira ticket with the PR link; optionally transition status.

With `LLM_MODE=mock` (default for local demo), a realistic login feature is produced without calling an API.

## Review checklist (for developers)

- [ ] Scenarios match acceptance criteria  
- [ ] Selectors match the real UI (`getByRole` / `getByLabel`)  
- [ ] No secrets or production PII in examples  
- [ ] Tags include `@jira-<KEY>`  
- [ ] `BASE_URL` in CI points at the right environment  

## Scripts

| Script | Description |
|---|---|
| `npm run pipeline` | Full automation run |
| `npm run pipeline:dry` | Generate without PR/Jira writes |
| `npm run generate` | Generate artifacts for one issue |
| `npm run test:cucumber` | Run Cucumber + Playwright |
| `npm run test:unit` | Node unit tests |
| `npm run typecheck` | TypeScript check |
| `npm run dev` | Start webhook server (watch mode) |

## License

MIT
