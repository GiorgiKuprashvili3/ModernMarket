# Database notes

Schema source of truth: `backend/prisma/schema.prisma`. Status of each part is tracked in `DEVELOPMENT_STATUS.md`.

## Parts

| Part | Contents | State |
|---|---|---|
| 1 | identity, auth tokens, profiles, addresses, seller applications/documents, audit log, outbox, platform settings, idempotency keys | written, unvalidated |
| 2 | seller stores, categories, brands, products, variants, images, attributes, moderation history, vehicle details, digital files, inventory and inventory movements | written, unvalidated |
| 3 | shopping (cart, wishlist, comparison, recently viewed), orders, seller orders, order items, status histories, delivery arrangements, COD payment records, refunds, disputes | written, unvalidated |
| 4 | finance (commission rules, ledger, balances, invoice counter, invoices, invoice items/payments, credit notes, subscription plans/subscriptions/payments, promotion types/promotions, platform revenue entries) | written, unvalidated |
| 5 | reviews (+images, reports), conversations/participants/messages/reports, notifications and preferences, email outbox, vehicle inquiries, digital download permissions and log, exchange rates and history, newsletter, search history and stats, home sections, legal documents, user consents | written, unvalidated |

## Decisions made while modelling (differ slightly from the architecture draft)

1. **Every physical or digital product has at least one variant.** Simple products get a single default variant. Price, SKU and stock live on the variant, so carts, orders and inventory deal with one purchasable unit. Vehicles have no variants and no inventory. `products.min_price_gel` is a denormalized display/sort value only; checkout always reads the variant price.
2. **No separate `stock_reservations` table.** Stock is decremented when the order is placed and every change is recorded in `inventory_movements` (RESERVE, RELEASE, COMMIT, RESTOCK). The order item plus its movements already show what is held and why. Revisit if cart-time holds are ever introduced.
3. **Attribute definitions use inline Georgian/English name columns** instead of a translations table, since there are exactly two languages and the set is small.
4. **Append-only tables**: `audit_logs`, `inventory_movements`, `product_moderation_history` (and later order/payment status history, commission ledger, invoice payments, exchange rate history). Enforcement by database triggers is planned in a raw-SQL migration.
5. **No `promotional_listings` slot table.** Slot availability for a placement is checked by counting overlapping approved/active promotions against `promotion_types.max_slots` inside a transaction. Add a slot table only if per-slot ordering becomes a requirement.
6. **Ledger idempotency** is `UNIQUE(order_item_id, entry_type, correction_seq)`; invoice idempotency is `UNIQUE(seller_profile_id, period_start, period_end, invoice_type)`; a ledger entry can sit on only one invoice (`seller_invoice_items.ledger_entry_id` unique).

## Raw-SQL migration (to be written after the first `prisma migrate dev`)

Prisma cannot express these, so they are added by a hand-written migration:

- FULLTEXT index on `product_translations (title, description)`; validate Georgian behavior first.
- `CHECK (quantity_on_hand >= 0)` on `inventory`.
- `CHECK (rating BETWEEN 1 AND 5)` on reviews (later part).
- `BEFORE UPDATE`/`BEFORE DELETE` triggers raising an error on append-only tables.
- `CHECK` that a product of kind VEHICLE has no variants is enforced in the service layer (cross-table), with a test.
