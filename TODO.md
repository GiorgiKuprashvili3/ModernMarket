# TODO

## Next (Milestone 1)

- [ ] Install backend dependencies; run `prisma validate`, generate first migration, build, run health e2e test.
- [ ] Install frontend dependencies; run `ng build` and `ng test` to verify the Angular skeleton.
- [ ] Frontend: currency display service, HTTP client + auth interceptor (Milestone 2).
- [ ] Remaining Prisma models: finance, communication, platform extras (parts 4-5).
- [ ] Raw-SQL migration for append-only triggers on audit_logs, ledger and history tables.
- [ ] ER diagram and `documentation/database/`.
- [ ] GitHub Actions CI (lint, test, build).
- [ ] Spike: Georgian FULLTEXT search behavior; Georgian font in PDF generation.

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
