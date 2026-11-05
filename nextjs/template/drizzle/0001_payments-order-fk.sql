-- Cross-module constraint: a payment must belong to an existing order. It lives here, in a
-- reviewed migration, because it belongs to neither module's table file alone: the owners of
-- orders and billing review it together.
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT;
