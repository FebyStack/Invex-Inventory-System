-- Freeform per-product notes. Lets operators jot down status,
-- handling instructions, or any context the structured columns
-- can't capture. Nullable; existing rows stay untouched.
ALTER TABLE invex.products
    ADD COLUMN IF NOT EXISTS notes TEXT;
