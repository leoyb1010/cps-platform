# Default Publishing Policy

## Hard Rules

- Only operate accounts that the user owns or is explicitly authorized to operate.
- Use the deployment Mac's logged-in browser session; do not ask for or store social account passwords.
- Do not bypass captcha, login checks, platform risk controls, rate limits, or access controls.
- Do not bulk post duplicate content across accounts.
- Do not click final publish unless runbook `mode` is explicitly `publish` or `schedule`.
- Keep a trace and key-page screenshots for every browser automation task.
- Stop and report `waiting_for_user` when login, captcha, risk control, unclear UI, or high-risk content appears.
- Do not expose provider API keys to the browser bundle.

## Modes

### Draft Mode

Fill the editor, upload assets, screenshot the confirmation page, and stop before final publish.

### Assist Mode

Prepare the draft and wait for the human to approve the final click.

### Autopilot Mode

May publish, schedule, or low-risk reply only when:

- `mode=publish` or `mode=schedule` is explicit
- account pacing limits are respected
- policy gate passes
- browser trace is enabled
- high-risk comments and regulated topics are escalated

## Content Gate

Before publishing, check for:

- sensitive words
- exaggerated claims
- medical/financial/legal advice
- platform-specific banned terms
- duplicate content
- unverified factual claims
- unsafe calls to action

## Comment Gate

Low-risk comments can receive helpful replies. Escalate when comments include:

- personal private information
- medical, financial, legal, or safety advice
- accusations, harassment, or illegal content
- brand crisis or platform moderation risk
- requests that require facts not present in source material

## Account Pacing

Start conservative:

- 小红书: 1-3 posts/day, comments <= 12/session
- 微博: 1-8 posts/day, comments <= 20/session
- X: 1-6 posts/day, replies <= 20/session
- Instagram: 1-3 posts/day, replies <= 12/session
- LinkedIn: 1-2 posts/day, replies <= 10/session

Production should move these limits into per-brand and per-account settings.
