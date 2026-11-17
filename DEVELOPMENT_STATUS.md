# Development Status

Last updated: 2026-11-16 (step 5)

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
- Seed script for roles, permissions and default platform settings.
- Angular skeleton (hand-written, unbuilt): standalone components, Signals, lazy routes, SCSS design tokens, public layout shell, signal-based Georgian/English translation service with a unit spec, dev proxy to the API.

## Not yet done in Milestone 1

- Dependencies not installed and nothing built or tested yet: the development session used so far had no package-install access. **All code so far is unverified**: it has not been compiled, `prisma validate` has not been run, and no migration has been generated.
- Remaining Prisma models: communication and platform extras (part 5).
- First migration, ER diagram file, database documentation.
- CI workflow.

## Working features

None user-facing yet.

## Known issues

- Dependency versions in `backend/package.json` are ranges chosen without registry access and must be re-resolved on first install (Prisma and NestJS major versions in particular).
- Business decisions from the architecture document (section 24) are being implemented with the proposed defaults until changed.
