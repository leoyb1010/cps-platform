# CPS Platform: two additional role-simulation rounds

Date: 2026-10-01 UTC. Base: `269cc194b6caea1e6fdf23c836543b7123782f15` on `codex/audit-cps-platform-20261001`. These are additional rounds, not a relabeling of the earlier audit. Existing reports supplied the baseline contracts; all results below come from new execution against this branch.

## Boundaries and actual roles

Testing used synthetic seeded users, disposable SQLite databases, mocked external providers, and local-only browser fixtures. No production service, payment, customer dataset, real credentials, merge, or deployment was used. The Codex Security deep-scan server was unavailable; no managed scan is claimed.

| Actor | Normal journey exercised | Negative boundary |
|---|---|---|
| Public shopper | Public product catalog; existing quote/bundle fixture suite | Anonymous orders/member directory rejected |
| Platform super administrator | Member directory, compatible role assignment | Cannot create super or mismatched role/scope via PATCH |
| Finance | Settlement read; reassignment and fresh-login recovery | Member directory denied; old access and refresh revoked |
| Risk / support | Ticket read; existing refund/complaint suite | Settlement read denied by role |
| Operations | Brand read; existing contracts/fulfillment suite | Member directory denied |
| Read-only auditor | Audit log read | Refund and member-management denied |
| Team administrator | Staff directory; customer status management | Internal staff management and role changes denied |
| Brand owner | Own portal summary/products and workspace history | Internal orders, other workspaces and invalid role reassignment denied |
| Agent | Own portal summary/payout and workspace credit state | Brand/internal endpoints and brand job mutation denied |
| Scoped brand auditor | Own brand-filtered orders | Global audit denied; UI explicitly reports missing portal permissions |
| Studio local demo / signed gateway caller | Existing local-origin and signed workspace contract suites | Unsigned gateway, shared legacy state, cross-origin demo calls rejected |

Permission and scope are independent boundaries. A permission such as `member.manage` does not confer platform scope. Studio identities continue to preserve the existing `A-2041` / `U-*` canonical-to-storage mapping. No financial ledger, refresh-token migration, renderer sandbox, or backup behavior was weakened.

## Additional round 1: normal work and denied actions

1. **Role changes bypassed account-provisioning scope rules.** Admin PATCH could turn an internal operations account into a brand role while retaining platform scope, or turn a brand-scoped account into finance/agent. Three HTTP tests expected 403 but received 200. PATCH now checks the existing scope against the requested role. Existing scoped audit accounts may remain unchanged; this does not silently migrate them. The member dialog offers compatible roles only and removes the prohibited super option from invitation/assignment choices.
2. **Logout/bootstrap state races survived the earlier HTTP-only fixes.** A stalled logout kept the previous account visible; a delayed bootstrap rejection erased a later successful login; definitive refresh revocation cleared the user view but allowed an already in-flight old-account response to resolve. Three new lifecycle tests failed before repair. Logout now clears user, business cache, and token generation synchronously, deduplicates revocation, and lets a later login wait for the logout response so a late `Set-Cookie` cannot erase its new cookie. Bootstrap failures only clear their own generation. Revocation advances the HTTP generation. Real-mode identity no longer trusts a persisted localStorage user snapshot before server validation.
3. **Team manager affordances did not match server policy.** The member page offered management for internal staff despite server rejection, and mock customer rows were mislabeled as platform-scoped. The page now shows the actual scope, customer-only management, and an explicit protected/internal-staff explanation. Two missing synthetic roles, teamadmin and brandaudit, are now available in demo mode. This is a source/unit-verified UI correction; visual verification is separately gated below.

## Additional round 2: challenge repairs and cross-role handoffs

1. **Shared-cookie account replacement could replay a write as another user.** Independent HTTP challenge replaced the refresh identity with a different account. Before the fix the original POST retried and resolved successfully under the other account. Access state is now bound to the validated user ID; a refresh that returns a different/missing ID ends that tab's session without replay. Same-user refresh still rotates and retries exactly once. A hosted two-tab real-API browser case challenges the same boundary.
2. **Independent review extended the session challenge.** Three additional before-fix tests showed concurrent logins were not ordered and logout could race a still-pending login/refresh Set-Cookie. Every cookie-changing auth request now shares one FIFO and the cross-tab Web Lock; explicit login invalidates its generation immediately, so latest intent wins. Request timeouts start when a queued request actually dispatches. New browser cases delay an actual isolated-backend response before it reaches the browser. A partially completed platform hydration also restored old fulfilled rows after logout and blocked the next account’s hydration. Three store regressions now cover aggregate generation gating, independent new-account hydration, and the old unbound persistent real-data cache. Real business data is now kept in memory only; mock persistence and same-session offline recovery remain intact.
3. **Tenant-scoped member-management permission exposed global state.** A synthetic brand-scoped role with `member.manage` could read the global member directory, even though scope should remain a separate restriction. All member/role/permission endpoints now require platform scope as well as their existing permission/super checks. The new real HTTP suite proves no foreign customer status change and no global directory access from that account. Correctly scoped platform reassignment still works; old access/refresh fails, then a fresh login obtains the new role.
4. **Older creator jobs vanished and hostile history limits were unbounded.** With 205 synthetic jobs, the oldest owned job was reported missing because detail lookup scanned only the latest 200. Negative or huge limits returned the entire history; nonfinite/fractional values caused SQLite errors. Seven of nine new Studio cases failed. Detail lookup now uses a direct `(workspace_id, id)` query, and list limits default safely or cap at 200. Foreign workspace lookup/mutation remains denied. Independent brand/agent reservation, consumption and repeated-release tests preserve balances and job-local idempotency.

## Reproduction and regression commands

Before fixes, newly added tests produced: auth lifecycle 3/3 failed; cross-cookie mutation test 1/1 failed; backend role journeys 4/16 failed; Studio role history 7/9 failed. Independent review added three failing auth-order cases and three failing cache/hydration cases before their fixes. The three role-change tests observed real HTTP 200 instead of 403. The cookie test observed a resolved POST rather than rejection. Studio observed 205 rows and real SQLite datatype errors.

Run from the repository root unless stated:

```sh
npm test
npm run lint
npm run build
npm test -- src/lib/auth.session.test.ts src/lib/http.test.ts src/lib/store.session.test.ts src/lib/memberAccess.test.ts
cd server
npm run prisma:generate
npm test
npm run build
sh scripts/check-schema-sync.sh
cd ../services/agent-studio
npm test -- --exclude server/src/renderer.test.js --exclude server/src/render-egress.test.js
npm run build
```

Final local checkpoint (rerun against the complete patch on 2026-10-01 UTC): web **66/66** across **10 files**, lint, and build passed; backend **276/276** across **18 files**, build, and schema synchronization passed; Studio **84/84 non-browser tests** across **16 files** and build passed. `git diff --check` passed. Independent review separately reran **22** auth/HTTP/store/member cases, **16** real Nest/SQLite role cases, and **9** Studio role cases after the final fixes. No unresolved failing assertion remains in the executed local gates. The full Studio baseline ran **75/77** before additions; its two real-browser suites failed because Chromium was unavailable to this process, not because their assertions passed. Chromium installation returned a corrupt/empty archive; the installed system Chromium also failed at `socket()` with `Operation not permitted`, including a reviewed escalation. Those two suites are explicitly excluded from the local passing count and remain required in hosted CI. This is not a full local browser pass.

The new `playwright.roles.config.ts` discovers 15 real-API browser journeys: all nine seeded accounts, team-manager modal/Escape, compatible-role mobile dialog/Cancel, real two-tab cookie handoff, delayed login/refresh Set-Cookie after logout, and overlapping-login cookie ownership. A dedicated branch CI job seeds a disposable backend and captures screenshots in `/tmp/cps-role-ui-audit/`; the existing mock browser, Studio renderer/egress/video, PostgreSQL, Docker and dependency gates remain enabled. Artifact images must be downloaded and actually viewed before making visual quality claims. Exact-SHA terminal results and reviewed screenshots belong to the delivery checkpoint after publication; merely adding a CI job is not evidence it ran.

## Limits and recovery

No schema/data migration is needed for these changes. Invalid historical role/scope combinations are rejected by new role edits rather than automatically rewritten. Authorized administrators must use a deliberate account-provisioning decision when a person's tenant identity truly changes. A scoped audit account remains supported for API reads; it still lacks ordinary brand portal permissions and sees an explicit explanation rather than being promoted.

The new browser tests use the actual local NestJS backend with synthetic data, not production. They do not establish live payment/provider correctness, load capacity, every accessibility criterion, multi-device session behavior, or zero defects. Existing deterministic concurrency, money, backup and rendering-boundary suites were rerun, but only the hosted browser suites can supply current visual/rendering evidence in this environment. No claim is made for optional Hyperframes process isolation.
