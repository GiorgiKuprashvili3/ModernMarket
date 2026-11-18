-- DRAFT: hand-written constraints Prisma cannot express.
-- NOT yet applied or tested. After the first `prisma migrate dev`, create an empty migration with
-- `prisma migrate dev --create-only --name post_schema_constraints`, paste this file into it, review
-- against the generated table/column names, then run `prisma migrate dev`.
-- Requires MySQL 8.0.16+ (enforced CHECK constraints).
-- Creating triggers with binary logging on needs SUPER or `log_bin_trust_function_creators=1`
-- (set in docker-compose.yml for local development). Production must do the same or run this
-- migration as a privileged user.

-- ---------------------------------------------------------------- CHECK constraints

ALTER TABLE inventory ADD CONSTRAINT chk_inventory_qty_nonneg CHECK (quantity_on_hand >= 0);
ALTER TABLE cart_items ADD CONSTRAINT chk_cart_item_qty_pos CHECK (quantity > 0);
ALTER TABLE order_items ADD CONSTRAINT chk_order_item_qty_pos CHECK (quantity > 0);
ALTER TABLE order_items ADD CONSTRAINT chk_order_item_price_nonneg CHECK (unit_price_gel >= 0 AND line_total_gel >= 0);
ALTER TABLE seller_orders ADD CONSTRAINT chk_seller_order_total_nonneg CHECK (total_gel >= 0);
ALTER TABLE reviews ADD CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE product_variants ADD CONSTRAINT chk_variant_price_nonneg CHECK (price_gel >= 0);
ALTER TABLE commission_rules ADD CONSTRAINT chk_commission_rate CHECK (rate_percent >= 0 AND rate_percent <= 100);
ALTER TABLE order_items ADD CONSTRAINT chk_order_item_commission_rate CHECK (applied_commission_percent >= 0 AND applied_commission_percent <= 100);
ALTER TABLE seller_invoice_payments ADD CONSTRAINT chk_invoice_payment_nonzero CHECK (amount_gel <> 0);

-- ---------------------------------------------------------------- FULLTEXT search
-- Georgian is agglutinative and MySQL has no Georgian stemmer: prefix matching (term*) in BOOLEAN MODE
-- is the plan. Validate with real Georgian data before relying on it (see TODO).
ALTER TABLE product_translations ADD FULLTEXT INDEX ft_product_translations (title, description);

-- ---------------------------------------------------------------- Append-only enforcement
-- Rows in these tables may be inserted but never updated or deleted by the application.
-- (Schema-level cascades from Prisma `onDelete: Cascade` on history tables apply only if a parent row
-- is deleted, which the application does not do for orders/products; use soft deletes instead.)

DELIMITER $$

-- Generic pattern, repeated per table below.
CREATE TRIGGER trg_audit_logs_no_update BEFORE UPDATE ON audit_logs
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only'; END$$
CREATE TRIGGER trg_audit_logs_no_delete BEFORE DELETE ON audit_logs
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only'; END$$

CREATE TRIGGER trg_ledger_no_update BEFORE UPDATE ON seller_commission_ledger
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'seller_commission_ledger is append-only'; END$$
CREATE TRIGGER trg_ledger_no_delete BEFORE DELETE ON seller_commission_ledger
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'seller_commission_ledger is append-only'; END$$

CREATE TRIGGER trg_invoice_payments_no_update BEFORE UPDATE ON seller_invoice_payments
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'seller_invoice_payments is append-only'; END$$
CREATE TRIGGER trg_invoice_payments_no_delete BEFORE DELETE ON seller_invoice_payments
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'seller_invoice_payments is append-only'; END$$

CREATE TRIGGER trg_inventory_movements_no_update BEFORE UPDATE ON inventory_movements
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'inventory_movements is append-only'; END$$
CREATE TRIGGER trg_inventory_movements_no_delete BEFORE DELETE ON inventory_movements
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'inventory_movements is append-only'; END$$

CREATE TRIGGER trg_order_status_history_no_update BEFORE UPDATE ON order_status_history
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order_status_history is append-only'; END$$
CREATE TRIGGER trg_order_status_history_no_delete BEFORE DELETE ON order_status_history
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'order_status_history is append-only'; END$$

CREATE TRIGGER trg_payment_status_history_no_update BEFORE UPDATE ON payment_status_history
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'payment_status_history is append-only'; END$$
CREATE TRIGGER trg_payment_status_history_no_delete BEFORE DELETE ON payment_status_history
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'payment_status_history is append-only'; END$$

CREATE TRIGGER trg_product_moderation_no_update BEFORE UPDATE ON product_moderation_history
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'product_moderation_history is append-only'; END$$
CREATE TRIGGER trg_product_moderation_no_delete BEFORE DELETE ON product_moderation_history
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'product_moderation_history is append-only'; END$$

CREATE TRIGGER trg_exchange_rate_history_no_update BEFORE UPDATE ON exchange_rate_history
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'exchange_rate_history is append-only'; END$$
CREATE TRIGGER trg_exchange_rate_history_no_delete BEFORE DELETE ON exchange_rate_history
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'exchange_rate_history is append-only'; END$$

CREATE TRIGGER trg_revenue_entries_no_update BEFORE UPDATE ON platform_revenue_entries
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'platform_revenue_entries is append-only'; END$$
CREATE TRIGGER trg_revenue_entries_no_delete BEFORE DELETE ON platform_revenue_entries
FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'platform_revenue_entries is append-only'; END$$

DELIMITER ;

-- Issued invoices are frozen: block edits to money fields once status is no longer DRAFT.
-- Status/paid_gel/pdf_key may still change (payments and overdue marking), amounts may not.
DELIMITER $$
CREATE TRIGGER trg_invoice_frozen_after_issue BEFORE UPDATE ON seller_invoices
FOR EACH ROW
BEGIN
  IF OLD.status <> 'DRAFT' AND (
       NEW.subtotal_gel <> OLD.subtotal_gel OR NEW.adjustments_gel <> OLD.adjustments_gel
    OR NEW.total_gel <> OLD.total_gel OR NEW.gross_eligible_sales_gel <> OLD.gross_eligible_sales_gel
    OR NOT (NEW.invoice_number <=> OLD.invoice_number)
    OR NOT (NEW.period_start <=> OLD.period_start) OR NOT (NEW.period_end <=> OLD.period_end)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'issued invoices cannot be rewritten; use a credit note or adjustment';
  END IF;
END$$
DELIMITER ;
