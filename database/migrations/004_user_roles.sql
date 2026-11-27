-- Three-tier RBAC for Invex.
--
--   super_admin  – unrestricted across every location
--   sub_admin    – full inventory ops, but scoped to one assigned location
--   staff        – read + day-to-day stock ops, scoped to one assigned location
--
-- `location_id` is the location every non-super-admin is tied to. Nullable
-- so super_admins (and users created via public registration who haven't
-- been provisioned yet) can exist without one.

ALTER TABLE invex.users
    ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES invex.locations(id);

CREATE INDEX IF NOT EXISTS idx_users_location_id
    ON invex.users(location_id)
    WHERE is_deleted = FALSE;

-- ── Step 1: Drop ALL existing CHECK constraints on the role column ──
-- The original CREATE TABLE uses an inline CHECK whose auto-generated name
-- varies by PostgreSQL version (could be "users_role_check", "users_check",
-- etc.). This DO block finds them all and drops them so the UPDATE below
-- won't violate the old ('admin','staff') constraint.
DO $$
DECLARE
    _con TEXT;
BEGIN
    FOR _con IN
        SELECT con.conname
          FROM pg_constraint  con
          JOIN pg_attribute   att
            ON att.attnum = ANY(con.conkey)
           AND att.attrelid = con.conrelid
         WHERE con.conrelid = 'invex.users'::regclass
           AND con.contype  = 'c'            -- CHECK constraints only
           AND att.attname  = 'role'
    LOOP
        EXECUTE format('ALTER TABLE invex.users DROP CONSTRAINT %I', _con);
    END LOOP;
END
$$;

-- ── Step 2: Rename legacy 'admin' rows to the new top tier (idempotent) ──
UPDATE invex.users
   SET role = 'super_admin'
 WHERE role = 'admin';

-- ── Step 3: Add the new three-role constraint ──
ALTER TABLE invex.users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('super_admin', 'sub_admin', 'staff'));

-- Non-super-admins must have a location once provisioned. We allow NULL
-- temporarily so the auth controller can create unassigned staff via the
-- public register endpoint; a super_admin then assigns them via /api/users.
-- Enforced at the application layer for "can perform actions" rather than
-- as a NOT NULL so the unassigned state remains valid in the DB.
