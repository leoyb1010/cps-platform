# Five new comprehensive audit rounds (2026-10-04 ledger)

Status: Round 1 accepted at 9f3866c3432c78252978df0890573c2a26747134 within its documented isolated scope. Round 2 accepted at 7141ed9239e08e1dfb50b70db21c6c6897c49a28 within its documented isolated scope. Round 3 in progress; rounds 4–5 not started.

Each round repeats a complete surface/role matrix with a fresh data set and newly inspected seams. Existing tests are regression protection, not five independent audits. Every round must include positive business outcomes with persisted readback, role denial, validation/failure/retry, repeated submission, interruption/close/back, draft and identity lifecycle, responsive/light-dark/keyboard/normal-reduced-motion review, complete applicable tests/build, exact code identity, screenshot pixel inspection and independent review. A blocked cell cannot be silently converted to pass.

## Evidence levels
- Actual UI + HTTP + disposable database: strongest integrated journey evidence
- HTTP + database or service + database: integration evidence; not UI
- Controlled response faults and mocked provider: client recovery evidence; not real provider evidence
- Static review: code reasoning, not an executed journey
- External production providers/payments/mail/SMS/KMS are explicitly excluded

## Safety
Only isolated synthetic environments; no production data, real money, deployment, merge, package publication or installations outside existing CI. Original workflow jobs retained. Branch CI contains no deploy step. Local cloud browser loopback returned ERR_BLOCKED_BY_CLIENT, so no bypass; browser evidence must come from isolated GitHub Actions and its downloaded screenshots.

## Round acceptance gates
1. Complete current matrix with role/resource/journey/case/result/code reference/evidence path
2. Reproduction of actual finding before fix, regression and full applicable final-code checks after fix
3. Screenshots read as pixels across supported form factors, themes and both motion modes
4. Independent reviewer response; unresolved findings and untested limits recorded
5. Exact remote commit and terminal CI for that commit

## Publication
Remote tree uses the verified baseline tree plus changed content-addressed blobs. Missing historical docs/screenshots are retained unchanged by SHA, mode and path. They are not current audit evidence.

