# Agent Studio Content OS

Agent Studio Content OS is an agent-first social media operations system for local Codex-style browser execution. The main README is Chinese-first; this file is a compact English reference.

## What it is

Agent Studio Content OS is a local-first operating layer for social content agents. It gives Claude, Codex, Browser-use, Stagehand, and similar agents a stable API surface for turning product or brand context into platform-specific content, visual assets, draft runbooks, comment maintenance tasks, and feedback loops.

The product boundary is deliberate: Codex is the local controller that orchestrates browser agents, validates account state, and collects trace evidence. It should not replace business judgment or own every step. Browser-use, Stagehand, Playwright, or another local browser executor performs webpage actions with your already logged-in accounts, and the default mode is always draft. Final publish or schedule actions require an explicit `mode=publish` or `mode=schedule` request.

## Features

- Agent-first content pack generation for multi-platform copy, cards, video frames, titles, policy checks, and automation prompts, with product-share topics using more grounded, less template-like copy.
- Research workflow with Tavily, Firecrawl, Jina, and deterministic local fallback builders.
- Visual Studio asset layer for cover PNGs, info cards, charts, infographics, motion HTML previews, and video scaffolds, including XHS product-real-scene, dense-infographic, and process-storyboard recipes.
- Agent-controller handoff through `/api/codex/pending-tasks`; Codex coordinates browser agents instead of being treated as the only worker.
- One-click XHS-style graphic smoke flow.
- Comment maintenance runbooks with human confirmation for risky replies.
- Analytics learning loop with PostHog integration when configured.
- Local persistence in `server/data/state.json`.
- Safety-first publishing model: no platform passwords, no CAPTCHA bypass, no risk-control bypass, and draft mode by default.

## Quick start

```bash
git clone https://github.com/leoyb1010/agent-studio-content-os.git
cd agent-studio-content-os
pnpm install
npx playwright install chromium
cp .env.example .env
pnpm build
PORT=48787 FRONTEND_PORT=45173 pnpm run local:start
```

Open the console:

```text
http://127.0.0.1:45173/
```

Open the agent manifest:

```text
http://127.0.0.1:48787/api/agent/manifest
```

Run the local Codex polling handoff example:

```bash
pnpm run codex:poll
```

## Quick smoke test

```bash
pnpm build
PORT=48787 FRONTEND_PORT=45173 pnpm run local:start
```

```bash
curl -X POST http://127.0.0.1:48787/api/smoke/graphic \
  -H 'Content-Type: application/json' \
  -d '{
    "topic": "用 Claude 做一个能自己跑活的小红书账号",
    "direction": "insight",
    "tone": "balanced",
    "platform": "xhs",
    "mode": "draft"
  }'
```

Expected result:

- response status is `queued_for_codex_app`
- `browserExecuted` is `false`
- generated files are written under `server/exports/`
- a draft task appears in `GET /api/codex/pending-tasks`

## API and service setup

Copy the environment template first:

```bash
cp .env.example .env
```

Common variables:

- `OPENAI_API_KEY`: LLM-backed content generation, research summarization, reply drafting, and review loops.
- `BROWSER_AGENT_RUNTIME`: local browser executor name, defaulting to `codex-app-local`.
- `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`, `JINA_API_KEY`: research and crawling providers.
- `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST`, `VITE_POSTHOG_KEY`: analytics providers.
- `DATABASE_URL`, `SUPABASE_*`, `NEON_REST_URL`: future production persistence slots.
- `IMAGE_GENERATION_API`, `VIDEO_RENDER_API`: optional future asset providers.

## How it works

```text
React console
  -> Hono BFF API
    -> content / research / visual builders
      -> Playwright local renderer
        -> local state store
          -> Codex pending-task queue
            -> Codex App or local browser executor
              -> trace, screenshots, task result, analytics learning
```

Key files:

- `src/lib/contentEngine.js`: content, runbook, research, comments, and analytics builders.
- `src/lib/visualEngine.js`: Visual Studio engine contracts and templates.
- `server/src/index.js`: Hono BFF and agent API routes.
- `server/src/renderer.js`: Playwright HTML/PNG renderer.
- `server/src/store.js`: local JSON persistence.
- `scripts/codex-poll.js`: local Codex task handoff example.

## Safety model

- No API keys in frontend code.
- No `.env` commits.
- No social platform passwords stored by this app.
- No CAPTCHA bypass.
- No platform risk-control bypass.
- No bulk duplicate posting.
- Draft mode by default.
- `publish` and `schedule` require explicit mode.
- Browser tasks require trace and key screenshots.
- High-risk comments require human confirmation.

## Testing

```bash
npm test
npm run build
npm audit --audit-level=moderate
```

## License

Private project unless a license file is added.
