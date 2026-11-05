-- Example catalog so the template runs end to end. Replace with your own data path.
INSERT INTO "prices" ("product_id", "unit_cents") VALUES ('widget', 1250), ('gadget', 4999)
ON CONFLICT ("product_id") DO NOTHING;
