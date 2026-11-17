# TODO

## Next (Milestone 1)

- [ ] Install backend dependencies; run `prisma validate`, generate first migration, build, run health e2e test.
- [ ] Install frontend dependencies; run `ng build` and `ng test` to verify the Angular skeleton.
- [ ] Frontend: currency display service, HTTP client + auth interceptor (Milestone 2).
- [ ] Validate the full schema, generate the first migration, then apply backend/prisma/sql/post_schema_constraints.sql as a second migration.
- [ ] Seed: categories, subscription plans, promotion types, exchange rates, home sections.
- [ ] ER diagram and `documentation/database/`.
- [ ] GitHub Actions CI (lint, test, build).
- [ ] Spike: Georgian FULLTEXT search behavior; Georgian font in PDF generation.

- [ ] M2 remaining: email worker (and clear sensitive payloads after sending), seller application API, profile/address API, admin permission guard, e2e auth tests, set `trust proxy` behind Nginx so rate limits see real client IPs, Redis-backed throttler store.

## Later milestones

- M2 Auth, users, RBAC, seller applications, outbox + email queue
- M3 Seller, catalog, uploads, moderation
- M4 Public marketplace (SSR, SEO, search)
- M5 Cart, multi-vendor checkout, orders, COD
- M6 Finance core (commissions, ledger, invoices)
- M7 Seller dashboard, subscriptions, promotions
- M8 Wishlist, comparison, reviews, messaging, notifications, vehicles, digital downloads
- M9 Admin dashboard, analytics, reports
- M10 Production preparation and deployment (deferred)

## Bugs

None recorded.
