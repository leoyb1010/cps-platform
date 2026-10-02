# Flow and capability coverage ledger

**tested-local** means executed this audit. **CI-runtime** means a committed hosted regression that needs exact-final-SHA confirmation. **static** means inspected source/inventory only. **not-run** marks an unverified integration. Nothing in this ledger treats a grep hit as a clicked button.

| Surface / journey | Controls and continuity | Evidence and limit |
|---|---|---|
| Login, portal login, profile, password | Roles, route guards, logout, refresh, overlapping logins, cross-tab replacement and delayed cookie response | tested-local auth/HTTP/store tests; CI-runtime 9 seeded roles and race journeys; real identity/provider accounts not-run |
| Dashboard / analytics | Task navigation, core/full density, role-aware actions, charts, empty/loading routes | static; existing mock browser tests and 19-route sweep CI-runtime; live analytics data not-run |
| Brands / agents / merchants / products / marketplace / barter / contracts | Page navigation, forms/list contracts, own-scope access, claims and state boundaries | tested-local backend/API tests and store tests; mocked browser route sweep CI-runtime; every operational mutation not-run |
| Orders / settlement / risk / complaints / compliance | Pagination, synthetic refund linkage, permissions, ledger/settlement boundaries and idempotency | tested-local backend suites; mock browser refund and paging CI-runtime; actual financial transactions not-run |
| Members / roles / audit / settings | Scope-compatible role selection, customer-only administration, Escape/Cancel, forbidden deep links | tested-local backend role and frontend access tests; real Nest/SQLite browser journeys CI-runtime |
| Platform AIGC | Unknown real balance, actual charge versus estimate, pending config, estimate edit/reorder, initial-balance race, busy inputs, demo preservation | tested-local 17 new actual-component DOM cases; mock-engine real-auth browser cases CI-runtime |
| Brand/agent portal AIGC | Form revision, intent/type/prompt/preset edits, delayed/overlapping estimates, config loading, submitted form, latest balance | tested-local new component cases; real-auth/mock-engine browser cases CI-runtime; live provider generation not-run |
| Brand portal | Summary, products, contracts, orders, settlements, API/developer, settings and claims/creative linkages | static inventory; backend tenant fixtures and real role login/denial CI-runtime; all portal buttons not-run |
| Agent portal | Summary, market, claims, subagents, contracts, commissions/payout, profile, landing | static inventory; tested-local scope/legacy ID fixtures and CI role tests; live attribution/payout integrations not-run |
| Public subscription store / landing / quote | Anonymous navigation, product choice, bundled quote; tenant write denial | tested-local market/backend suites; mock browser selection/quote CI-runtime; real order/payment not-run |
| Agent Studio factory / billing / job history | Local generation, failed reservation/release/consume, history >200, isolated A-/U- ownership, retry | tested-local 84 nonbrowser cases; actual Hono/SQLite local-fallback browser flow CI-runtime |
| Renderer / exported media | Network egress and output safety, visual sizing, desktop/tablet/mobile form | Local IPC blocked; existing full hosted Studio renderer/egress and screenshot jobs CI-runtime |

## Screenshot sequence and expected health

1. Seeded real role home pages: no loading skeletons, expected allowed destination
2. Member management modal: compatible options, safe Escape/Cancel, mobile controls
3. AIGC real balance unavailable: explicit unknown balance, no demo number
4. AIGC pending configuration: Generate and Estimate disabled
5. AIGC edited estimate: late response cannot restore old cost to current form
6. Platform generation response: confirmed 37-credit fixture charge, mobile layout
7. Existing Studio empty prompt → busy state → synthetic 503 → retry with real local fallback → persisted generated output and balance

Exact file names/results are in final CI artifact reports. AIGC engine fixtures and the real Studio local-fallback flow are deliberately identified separately.
