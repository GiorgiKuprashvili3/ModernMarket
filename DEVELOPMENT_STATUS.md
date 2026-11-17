# Development Status

Last updated: 2026-11-16 (step 7)

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

Written, not yet compiled or run (no package-install access):
- Register (enumeration-resistant), login (Argon2id, lockout after 5 failures, constant-time dummy verify for unknown emails), refresh-token rotation with family reuse detection and a 10-second concurrency grace, logout, email verification, forgot/reset password (resetting revokes all sessions), `GET /auth/me`.
- Access token (15 min JWT, public uuid only) is returned in the body; refresh token only in an HttpOnly, SameSite=Strict cookie scoped to `/api/v1/auth`; refresh/logout also require a custom header and an allowed Origin.
- Global guards: throttling, JWT auth (everything private unless `@Public()`), roles (`@Roles()`).
- Audit service; emails are queued to `email_outbox` (no worker yet, so no emails are actually sent).
- Unit specs for password hashing, token hashing and the login/refresh logic (mocked database).

Still to do for M2: email worker, seller application endpoints, user profile/address endpoints, permissions guard for admins, admin 2FA decision, e2e tests against a real database.

## Not yet done in Milestone 1

- Dependencies not installed and nothing built or tested yet: the development session used so far had no package-install access. **All code so far is unverified**: it has not been compiled, `prisma validate` has not been run, and no migration has been generated.
- Schema is fully drafted; needs validation and first migration.
- First migration, ER diagram file, database documentation.
- CI workflow.

## Working features

None user-facing yet.

## Known issues

- Dependency versions in `backend/package.json` are ranges chosen without registry access and must be re-resolved on first install (Prisma and NestJS major versions in particular).
- Business decisions from the architecture document (section 24) are being implemented with the proposed defaults until changed.
