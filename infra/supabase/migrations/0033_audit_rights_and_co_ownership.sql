-- WEG-Verwaltung migration 0033: audit_writer permissions local fallback bypass & ownership_co_owner join table.
--
-- Part 1: Grant usage and permissions to audit_writer inside a PL/pgSQL DO block with exception handling.
-- Part 2: Create public.ownership_co_owner join table with RLS, indexes, and composite FKs.
--

-- ---------------------------------------------------------------------------
-- Part 1: audit_writer permissions bypass
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- 1. Try granting Vault permissions
  BEGIN
    EXECUTE 'GRANT USAGE ON SCHEMA vault TO audit_writer';
    EXECUTE 'GRANT SELECT ON TABLE vault.decrypted_secrets TO audit_writer';
    RAISE NOTICE 'Successfully granted vault permissions to audit_writer.';
  EXCEPTION
    WHEN insufficient_privilege OR invalid_schema_name OR undefined_table THEN
      RAISE WARNING 'Could not grant vault permissions to audit_writer: insufficient_privilege. Fallback active.';
  END;

  -- 2. Try granting Extensions permissions
  BEGIN
    EXECUTE 'GRANT USAGE ON SCHEMA extensions TO audit_writer';
    EXECUTE 'GRANT EXECUTE ON FUNCTION extensions.hmac(bytea, bytea, text) TO audit_writer';
    RAISE NOTICE 'Successfully granted extensions.hmac permissions to audit_writer.';
  EXCEPTION
    WHEN insufficient_privilege OR invalid_schema_name OR undefined_function THEN
      RAISE WARNING 'Could not grant extensions permissions to audit_writer: insufficient_privilege. Fallback active.';
  END;
END $$;

-- ---------------------------------------------------------------------------
-- Part 2: public.ownership_co_owner Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ownership_co_owner (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL DEFAULT public.tenant_id()
                  REFERENCES public.tenant(id) ON DELETE RESTRICT,
  ownership_id    uuid NOT NULL,
  person_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Ensure that each person is linked to a specific ownership only once
  CONSTRAINT ownership_co_owner_uniq UNIQUE (tenant_id, ownership_id, person_id),
  
  -- Required for composite FK targets if downstream tables reference us
  CONSTRAINT ownership_co_owner_tenant_id_uk UNIQUE (tenant_id, id),

  -- Composite FK: Guarantees ownership belongs to the same tenant as this join record
  CONSTRAINT ownership_co_owner_ownership_fk
    FOREIGN KEY (tenant_id, ownership_id)
    REFERENCES public.ownership(tenant_id, id)
    ON DELETE CASCADE,

  -- Composite FK: Guarantees person belongs to the same tenant as this join record
  CONSTRAINT ownership_co_owner_person_fk
    FOREIGN KEY (tenant_id, person_id)
    REFERENCES public.person(tenant_id, id)
    ON DELETE RESTRICT
);

-- Table & Column Documentation
COMMENT ON TABLE public.ownership_co_owner IS
  'Join table mapping multiple people (co-owners) to a single ownership record. Enforces tenant isolation.';
COMMENT ON COLUMN public.ownership_co_owner.tenant_id IS
  'Identifies the tenant/agency. Enforces separation at the constraint and query layers.';
COMMENT ON COLUMN public.ownership_co_owner.ownership_id IS
  'References public.ownership. Must belong to the same tenant.';
COMMENT ON COLUMN public.ownership_co_owner.person_id IS
  'References public.person. Must belong to the same tenant.';

-- Indexes for Query Optimization
CREATE INDEX IF NOT EXISTS ownership_co_owner_ownership_idx 
  ON public.ownership_co_owner (tenant_id, ownership_id);

CREATE INDEX IF NOT EXISTS ownership_co_owner_person_idx 
  ON public.ownership_co_owner (tenant_id, person_id);

-- Row Level Security (RLS) Configuration
ALTER TABLE public.ownership_co_owner ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ownership_co_owner FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.ownership_co_owner FROM public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ownership_co_owner TO authenticated;

-- RLS Policies (using (SELECT public.tenant_id()) InitPlan wrapper)
CREATE POLICY ownership_co_owner_select_own_tenant
  ON public.ownership_co_owner FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.tenant_id()));

CREATE POLICY ownership_co_owner_insert_own_tenant
  ON public.ownership_co_owner FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.tenant_id()));

CREATE POLICY ownership_co_owner_update_own_tenant
  ON public.ownership_co_owner FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.tenant_id()));

CREATE POLICY ownership_co_owner_delete_own_tenant
  ON public.ownership_co_owner FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.tenant_id()));
