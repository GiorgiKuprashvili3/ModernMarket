# Modernmarket

Georgian multi-vendor marketplace (Angular + NestJS + MySQL/Prisma). Buyers shop across independent sellers in one cart, pay sellers directly by cash on delivery, and Modernmarket earns commission (invoiced monthly), subscriptions and promotions. All transactions are in GEL; USD/EUR are display-only.

Status: early development, Milestone 1 (foundation). See [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) and [TODO.md](TODO.md). The full design is in [documentation/architecture/ARCHITECTURE.md](documentation/architecture/ARCHITECTURE.md).

Hosting and deployment configuration are intentionally deferred.

## Prerequisites

- Node.js 22+
- Docker and Docker Compose (for local MySQL and Redis)

## Development setup

```bash
cp .env.example .env            # then edit the secrets
docker compose up -d            # MySQL 8 + Redis, bound to localhost only

cd backend
npm install
npx prisma migrate dev          # create/update the database schema
npm run prisma:seed             # roles, permissions, default settings
npm run start:dev               # API on http://localhost:3000/api/v1
```

- Swagger (development only): `http://localhost:3000/api/v1/docs`
- Health: `GET /api/v1/health/live`, `GET /api/v1/health/ready`

Frontend:

```bash
cd frontend
npm install
npm start                       # http://localhost:4200, /api proxied to :3000
```

## Repository layout

```
backend/          NestJS API, Prisma schema and migrations
frontend/         Angular app (coming next)
infrastructure/   Docker and deployment files (deployment deferred)
documentation/    architecture, database, API, business rules
```

## Principles

Backend owns all money, pricing, stock, commission and authorization logic. Financial records are append-only. See the architecture document for the full set of business rules.
