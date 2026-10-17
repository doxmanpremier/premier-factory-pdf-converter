ALTER TABLE entries ADD COLUMN unit_price_cents INTEGER;
ALTER TABLE entries ADD COLUMN unit_cost_cents INTEGER;
ALTER TABLE entries ADD COLUMN freight_cost_cents INTEGER;
ALTER TABLE entries ADD COLUMN freight_charge_cents INTEGER;
ALTER TABLE entries ADD COLUMN pricing_mode TEXT DEFAULT 'manual';
ALTER TABLE entries ADD COLUMN markup_percent REAL;
