# Development Status

## Verification status (updated 2026-11-18)

GitHub Actions now runs on every push (`.github/workflows/ci.yml`). Verified as of run 44214134514 (all green):
- Backend: dependencies install, `prisma validate`, `prisma generate`, TypeScript build, all unit tests (47), schema created on a real MySQL 8.4 (`prisma db push`), seed runs, raw-SQL constraints/triggers/FULLTEXT apply, the API boots, and a smoke test passes (health/ready, register 202, wrong-password login 401, correct login 200, `/auth/me` and an admin route without a token 401).
- Frontend: dependencies install, development build, unit tests (headless Chrome).

NOT yet verified: Prisma migrations (CI uses `db push`, no migration files exist yet), the append-only triggers actually blocking updates/deletes, FULLTEXT search on Georgian text, refresh-token rotation and role/permission checks against a real database, seller application flow end to end, emails (console transport only), production build and anything under hosting. Unit tests use mocked databases, so passing them does not prove the database code works.

Found and fixed by CI so far: test-code errors (BigInt serialization, missing reflect-metadata import, missing karma reporters) and trigger creation failing under MySQL binary logging.

Last updated: 2026-11-16 (step 8)

## Current milestone

Milestone 1: Architecture and foundation (hosting/deployment work deferred by decision).

## Completed

- Architecture proposal written and stored in `documentation/architecture/ARCHITECTURE.md`.
- Repository structure, `.gitignore`, `.env.example`.
- Local `docker-compose.yml` (MySQL 8.4 and Redis, localhost-only ports).
- Backend skeleton (NestJS): environment validation, global validation pipe, Helmet, CORS allow-list, Swagger (non-production), health endpoints.
- Prisma schema part 1: users, roles, permissions, auth tokens, buyer/seller profiles, addresses, seller applications and documents, audit log, outbox, platform settings, idempotency keys.
- Prisma schema part 2: seller stores, categories (nested), brands, products, variants, images, attributes, moderation history, vehicle details, digital files, inventory and movements. See documentation/database/README.md.
- Prisma schema part 3: cart, wishlist, comparison, recently viewed, orders (parent + per-seller), order items with price/commission snapshots, status histories, delivery arrangements, COD payment records, refunds, disputes.
- Prisma schema part 4: commission rules, append-only commission ledger, balance cache, invoice counter, invoices/items/payments, credit notes, subscription plans/subscriptions/payments, promotion types/promotions, platform revenue entries.
- Prisma schema part 5 (schema now has 84 models): reviews, messaging, notifications, email outbox, vehicle inquiries, digital download permissions (with PENDING_RELEASE for COD digital goods), exchange rates, newsletter, search, home sections, legal documents, consents.
- Draft raw-SQL constraints (CHECKs, FULLTEXT, append-only and frozen-invoice triggers) in backend/prisma/sql/post_schema_constraints.sql, not yet applied.
- Seed script for roles, permissions and default platform settings.
- Angular skeleton (hand-written, unbuilt): standalone components, Signals, lazy routes, SCSS design tokens, public layout shell, signal-based Georgian/English translation service with a unit spec, dev proxy to the API.

## Milestone 2 (started): authentication

Written; compiled and unit-tested in CI (see verification status above), database behavior not yet tested end to end:
- Register (enumeration-resistant), login (Argon2id, lockout after 5 failures, constant-time dummy verify for unknown emails), refresh-token rotation with family reuse detection and a 10-second concurrency grace, logout, email verification, forgot/reset password (resetting revokes all sessions), `GET /auth/me`.
- Access token (15 min JWT, public uuid only) is returned in the body; refresh token only in an HttpOnly, SameSite=Strict cookie scoped to `/api/v1/auth`; refresh/logout also require a custom header and an allowed Origin.
- Global guards: throttling, JWT auth (everything private unless `@Public()`), roles (`@Roles()`).
- Audit service; emails are queued to `email_outbox` (no worker yet, so no emails are actually sent).
- Unit specs for password hashing, token hashing and the login/refresh logic (mocked database).

Also written (step 8, same caveat: unbuilt, untested against a real database):
- Email worker: polls `email_outbox` every 5 s, leases rows, retries with exponential backoff (max 5), clears payloads (one-time links) after sending or final failure. Only a `console` transport exists (development); a real SMTP/provider transport is NOT implemented and production refuses to start with `console`.
- Plain-text ka/en templates for verify-email, reset-password, account-exists and the seller-application emails.
- Seller applications: applicant endpoints (`POST /seller-applications`, `GET /seller-applications/me`; requires verified email; rejected applicants can re-apply as a new revision) and admin endpoints (`list`, `detail`, `review`, `approve`, `reject`) behind role + `sellers.read` / `sellers.approve` permissions. Approval grants the `seller` role and creates the store with a transliterated slug. Identification numbers are AES-256-GCM encrypted; every admin view of one is audited. The seller role appears in the token at the next refresh.
- Permissions guard (reads permissions from the database per request so revocation is immediate), AES-GCM crypto service, slug utility with Georgian transliteration, env validation spec.
- Seller document upload is NOT implemented (needs the storage/uploads work in M3).

Still to do for M2: user profile/address endpoints, admin 2FA decision, e2e tests against a real database, document uploads.

## Not yet done in Milestone 1

- No migration files generated yet (CI uses `prisma db push`). Generate the first migration from a machine/CI with a database.
- Schema is fully drafted; needs validation and first migration.
- First migration, ER diagram file, database documentation.
- CI workflow.

## Working features

None user-facing yet.

## Known issues

- Dependency versions in `backend/package.json` are ranges chosen without registry access and must be re-resolved on first install (Prisma and NestJS major versions in particular).
- Business decisions from the architecture document (section 24) are being implemented with the proposed defaults until changed.
