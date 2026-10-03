# CPS product audit: two further rounds (2026-10-03)

## Branch, environment and non-production boundary

Started from `fdfc1b1e9016f3fa20597c5c3060b8bce2727e26` on the existing `codex/audit-cps-platform-20261001`. Default `main` was `08330b56334e6c7ecfb9e0adca3df9e44811846d`. Also checked `commercialization/upgrade` (`0e99b8f1`), `feat/deep-upgrade-2026-07` (`5013b732`), and `refactor/hardening-money-schema` (`993db041`); none was edited or merged. Source was fetched by immutable GitHub blob SHA into an isolated workspace. The final publication uses a delta atop the existing tree, preserving untouched binaries, modes and files.

Reviewed `.github/workflows/ci.yml`: audit branch jobs build/test disposable backends, browser fixtures, containers and databases; no deploy step. No production service access, real transactions, real customer data, migration/schema/dependency changes, repository-wide cleanup or deployment. The production patch is frontend-only. Canonical legacy A-/U- identities, job-scoped credit ledger, auth epochs, cross-tenant isolation and renderer egress isolation remain unchanged.

## Round 1: inventory and independently reproduced product bugs

`inventory.json` records discoverable page modules, router paths and backend controllers. `flow-ledger.md` distinguishes actual runtime tests, source inspection and unrun integrations; static button counts are not an all-buttons runtime claim.

Baseline gates passed: frontend 66/66, backend 276/276, Studio 84/84 non-browser tests. Real rendering and egress suites require hosted CI because local Chromium cannot open its IPC sockets under this sandbox.

Six new tests rendered the actual platform/portal components with controlled API timing and all six failed before repair:

1. **Real balance failure showed the demo account's 84,200 credits.** Real mode now displays an unknown balance rather than an invented amount. Demo mode retains its existing balance and local simulated generation.
2. **A completed generation displayed zero consumed credits when the user had not estimated first.** It could also display a stale estimate as actual consumption. The UI now reads the engine's existing `job.credits_charged` field. Confirmed zero stays zero; absent/invalid actual charge is explicitly unknown. No billing mutation changed.
3. **A delayed estimate could be applied to an edited form; changing intent did not clear a settled estimate.** A small shared hook now scopes estimates to the form revision and latest request. Type, intent, prompt and preset changes retire older estimates; unmount retires pending results and stale failures too.

## Round 2: challenge and compatible refinements

- Both Generate buttons were enabled before engine configuration arrived. Two new tests reproduced that gap. Generate/Estimate now wait for a valid configuration and current asset type.
- Independent review challenged balance response ordering. An initial read of 100 arriving after generation returned 63 overwrote the newer balance on both interfaces. Two new tests reproduced this; a per-component credit revision now fences the old initial response.
- Independent review challenged edits during generation. Inputs remained editable, and completion could clear the user's newer prompt. The two actual forms are now disabled only while their submitted generation is pending, then enabled again. Two before-fix tests failed and pass after repair.
- Added tests for overlapping estimates, true zero versus missing charge, and demo-mode preservation. The complete new component suite is 17 cases.
- No backend financial, auth, identity, tenant or renderer code was modified. Existing full suites and isolated CI remain required.

## Evidence and test distinctions

- `evidence/round1-aigc-reproduction.log`: six failing before-fix component cases
- `evidence/round2-loading-reproduction.log`: two additional failing configuration-loading cases
- `evidence/round2-balance-form-reproduction.log`: four independently suggested failing balance/form cases
- `src/pages/aigc-product.test.tsx`: real React DOM rendering in jsdom, with mock engine responses; this is not screenshot evidence or provider integration
- `e2e/real/role-journeys.spec.ts`: actual isolated Nest/SQLite authentication and role journeys. New AIGC timing/charge UI scenarios explicitly mock only the engine boundary to avoid providers and payments
- Existing Studio browser harness exercises the real local Hono/SQLite generation flow, deliberately injected 503, retry, local fallback output, credit consumption and mobile controls. Existing real-renderer/egress tests are retained
- Existing mock frontend browser sweep now visits all 19 listed main console screen families; snapshots, role journeys and responsive checks are in hosted CI artifacts

Final local checks: frontend 83/83 tests (17 new component cases), backend 276/276, Studio 84/84 non-browser; frontend lint/build, backend build/schema synchronization, and Studio build passed. Exact-SHA hosted jobs/artifacts are part of the delivery checkpoint. Screenshots must be downloaded and viewed before claiming visual verification. Adding a browser assertion is not proof it ran.

## Limits

No full WCAG certification or exhaustive runtime click-through is claimed. Live payment/acquirer/SMS/email/model/KMS services, production load, operator data and real assets were not exercised. Frontend mock/demo tests do not prove backend integration. Hosted engine-boundary fixtures do not prove real model quality or provider billing. Existing local renderer/egress tests were explicitly excluded locally and must pass in final hosted Studio CI. This patch does not add refunds, cancel server-side generations, alter pricing, or migrate balances.

### Hosted boundary regression and correction

The initial hosted run at `8901d74` failed the existing real Chromium canary: an about:blank popup could navigate before asynchronous closure, resulting in one loopback request. The real role UI and ordinary frontend/browser suites passed, but that run is not a complete pass. The self-contained renderer now receives its document through a locally fulfilled reserved `.invalid` URL with a response-header CSP sandbox. Scripts remain enabled for animation; popup creation and same-origin privileges remain disabled by the browser before scripts run. Existing network routes, WebSocket denial and popup cleanup remain in place. No production network or operating-system settings change. Final hosted real rendering and canary checks are required to validate this correction.
