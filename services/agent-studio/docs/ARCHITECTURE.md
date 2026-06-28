# Agent Studio Architecture

## Product Shape

Agent Studio is an agent-first creator operating system for local social media operations.

The product is not a generic post writer and not a normal scheduling SaaS. The intended runtime is:

1. Agent Studio BFF creates structured work: research, content packs, assets, runbooks, comment tasks, analytics tasks.
2. Codex app on the deployment Mac reads those tasks.
3. Codex app operates the local logged-in browser session.
4. Screenshots, traces, URLs, failures, and learnings are written back to Agent Studio.

Humans define strategy, brand voice, accounts, risk tolerance, and review boundaries. Agents run the repeatable work.

## Layers

### Web Console

`src/main.jsx` remains the human-visible control room for previewing packs, assets, publish tasks, activity, API health, and business surfaces. It is not the primary operator.

### BFF API

`server/src/index.js` exposes the agent contract:

- `POST /api/generate`
- `POST /api/research/collect`
- `POST /api/research/brief`
- `POST /api/research/topics`
- `GET /api/research/sources`
- `POST /api/assets/render-html`
- `POST /api/assets/export-png`
- `POST /api/smoke/graphic`
- `POST /api/assets/export-video`
- `POST /api/agent/runbook`
- `POST /api/agent/browser-task`
- `POST /api/agent/trace`
- `GET /api/agent/runs/:id`
- `POST /api/codex/runbook`
- `POST /api/codex/task-result`
- `POST /api/codex/screenshot`
- `GET /api/codex/pending-tasks`
- `POST /api/agent/comments/read`
- `POST /api/agent/comments/reply-draft`
- `POST /api/agent/comments/maintain`
- `POST /api/analytics/collect`
- `POST /api/analytics/brief`
- `POST /api/analytics/learning`

### Research Layer

The local implementation mirrors Firecrawl/Crawl4AI/GPT Researcher style contracts and now attempts live Tavily / Firecrawl / Jina collection when server-side keys are configured:

```text
source_items -> research_brief -> topic_candidates -> content_pack
```

`src/lib/contentEngine.js` contains deterministic local builders so the product can be tested before external providers are connected or when a provider fails.

### Asset Layer

The preferred first renderer is HTML/CSS, not image generation API.

```text
content_pack JSON -> HTML/CSS deck -> Codex/Playwright screenshot -> PNG deck -> browser upload
```

`POST /api/assets/render-html` returns a complete HTML deck suitable for screenshot export. `POST /api/assets/export-png` uses Playwright locally and writes PNG cards under `server/exports/`. `POST /api/smoke/graphic` composes the golden path for testing: generate an XHS content pack, export the PNG deck, and queue a draft Codex runbook without controlling the browser. `export-video` remains a runbook-ready placeholder until ffmpeg/remotion is wired.

### Codex App Local Browser Executor

Codex app is the default executor through `BROWSER_AGENT_RUNTIME=codex-app-local`.

Runbooks include:

- `executor: codex-app-local`
- `requiresLoggedInBrowser: true`
- platform open URL
- local assets
- content payload
- explicit steps
- stop condition
- screenshot and trace requirements
- failure recovery
- forbidden actions

Codex app should stop on login, captcha, risk-control prompts, missing UI, or unapproved final publish actions.

### Memory Layer

The commercial schema tracks source items, research briefs, topic candidates, browser tasks, agent runs, metrics, comments, and brand learnings. The local BFF persists `codexTasks`, `agentRuns`, and traces to `server/data/state.json` so restarts do not lose the Codex queue; production should migrate this contract to Postgres/Supabase/Drizzle.

## Safety Boundary

Provider API keys never go to the browser bundle. Browser tasks may only use user-authorized logged-in accounts. The product forbids captcha bypass, risk-control bypass, bulk duplicate posting, unapproved final publish, and unsafe automatic replies.
