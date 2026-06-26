-- WEG-Verwaltung pgTAP regression tests for 0055 advisor hardening.
--
-- Catalog-only: verifies API EXECUTE grants and policy definitions without
-- mutating tenant data.

begin;

select plan(29);

-- Public SECURITY DEFINER wrappers remain authenticated-only and reject anon.
select ok(
  not has_function_privilege('anon', 'public.audit_integrity_status()', 'execute'),
  'anon cannot execute audit_integrity_status'
);

select ok(
  not has_function_privilege('anon', 'public.audit_verify_chain()', 'execute'),
  'anon cannot execute audit_verify_chain'
);

select ok(
  not has_function_privilege('anon', 'public.check_partition_archivable(text)', 'execute'),
  'anon cannot execute check_partition_archivable'
);

select ok(
  not has_function_privilege('anon', 'public.get_archivable_partitions()', 'execute'),
  'anon cannot execute get_archivable_partitions'
);

select ok(
  not has_function_privilege('anon', 'public.is_partition_detached(text)', 'execute'),
  'anon cannot execute is_partition_detached'
);

select ok(
  has_function_privilege('authenticated', 'public.audit_integrity_status()', 'execute'),
  'authenticated can still execute audit_integrity_status'
);

select ok(
  has_function_privilege('authenticated', 'public.audit_verify_chain()', 'execute'),
  'authenticated can still execute audit_verify_chain'
);

select ok(
  has_function_privilege('authenticated', 'public.get_archivable_partitions()', 'execute'),
  'authenticated can still execute get_archivable_partitions'
);

select ok(
  has_function_privilege('authenticated', 'public.check_partition_archivable(text)', 'execute'),
  'authenticated can still execute check_partition_archivable'
);

select ok(
  has_function_privilege('authenticated', 'public.is_partition_detached(text)', 'execute'),
  'authenticated can still execute is_partition_detached'
);

-- Trigger-only SECURITY DEFINER functions are not direct API/RPC surfaces.
select ok(
  not has_function_privilege('anon', 'public.tg_sollstellung_enforce_insert_only()', 'execute'),
  'anon cannot execute tg_sollstellung_enforce_insert_only'
);

select ok(
  not has_function_privilege('authenticated', 'public.tg_sollstellung_enforce_insert_only()', 'execute'),
  'authenticated cannot execute tg_sollstellung_enforce_insert_only'
);

select ok(
  not has_function_privilege('anon', 'public.tg_unit_prevent_posted_mea_rewrite()', 'execute'),
  'anon cannot execute tg_unit_prevent_posted_mea_rewrite'
);

select ok(
  not has_function_privilege('authenticated', 'public.tg_unit_prevent_posted_mea_rewrite()', 'execute'),
  'authenticated cannot execute tg_unit_prevent_posted_mea_rewrite'
);

select ok(
  not has_function_privilege('anon', 'public.tg_wirtschaftsplan_lifecycle_guard()', 'execute'),
  'anon cannot execute tg_wirtschaftsplan_lifecycle_guard'
);

select ok(
  not has_function_privilege('authenticated', 'public.tg_wirtschaftsplan_lifecycle_guard()', 'execute'),
  'authenticated cannot execute tg_wirtschaftsplan_lifecycle_guard'
);

select ok(
  not has_function_privilege('anon', 'public.tg_wirtschaftsplan_prevent_effective_rewrite()', 'execute'),
  'anon cannot execute tg_wirtschaftsplan_prevent_effective_rewrite'
);

select ok(
  not has_function_privilege('authenticated', 'public.tg_wirtschaftsplan_prevent_effective_rewrite()', 'execute'),
  'authenticated cannot execute tg_wirtschaftsplan_prevent_effective_rewrite'
);

select ok(
  not has_function_privilege('anon', 'public.tg_wirtschaftsplan_prevent_posted_rewrite()', 'execute'),
  'anon cannot execute tg_wirtschaftsplan_prevent_posted_rewrite'
);

select ok(
  not has_function_privilege('authenticated', 'public.tg_wirtschaftsplan_prevent_posted_rewrite()', 'execute'),
  'authenticated cannot execute tg_wirtschaftsplan_prevent_posted_rewrite'
);

-- Advisor initplan hardening: policy expressions use SELECT-wrapped helpers/GUCs.
select like(
  lower(pg_get_expr(polqual, polrelid)),
  '%( select %auth.jwt%tenant_id%',
  'embedding_select_own_tenant SELECT-wraps auth.jwt'
)
from pg_catalog.pg_policy
where polrelid = 'public.embedding'::regclass
  and polname = 'embedding_select_own_tenant';

select like(
  lower(pg_get_expr(polwithcheck, polrelid)),
  '%( select %auth.jwt%tenant_id%',
  'embedding_insert_own_tenant SELECT-wraps auth.jwt'
)
from pg_catalog.pg_policy
where polrelid = 'public.embedding'::regclass
  and polname = 'embedding_insert_own_tenant';

select like(
  lower(pg_get_expr(polqual, polrelid)),
  '%( select %auth.jwt%tenant_id%',
  'embedding_update_own_tenant SELECT-wraps auth.jwt in USING'
)
from pg_catalog.pg_policy
where polrelid = 'public.embedding'::regclass
  and polname = 'embedding_update_own_tenant';

select like(
  lower(pg_get_expr(polwithcheck, polrelid)),
  '%( select %auth.jwt%tenant_id%',
  'embedding_update_own_tenant SELECT-wraps auth.jwt in WITH CHECK'
)
from pg_catalog.pg_policy
where polrelid = 'public.embedding'::regclass
  and polname = 'embedding_update_own_tenant';

select like(
  lower(pg_get_expr(polqual, polrelid)),
  '%( select %auth.jwt%tenant_id%',
  'embedding_delete_own_tenant SELECT-wraps auth.jwt'
)
from pg_catalog.pg_policy
where polrelid = 'public.embedding'::regclass
  and polname = 'embedding_delete_own_tenant';

select like(
  lower(pg_get_expr(polwithcheck, polrelid)),
  '%( select %current_setting%app.sollstellung_writer%',
  'sollstellung_insert_generated SELECT-wraps writer GUC'
)
from pg_catalog.pg_policy
where polrelid = 'public.sollstellung'::regclass
  and polname = 'sollstellung_insert_generated';

select like(
  lower(pg_get_expr(polqual, polrelid)),
  '%( select %current_setting%app.audit_chain_tenant_id%',
  'audit_event_chain_read_for_audit_writer SELECT-wraps tenant GUC'
)
from pg_catalog.pg_policy
where polrelid = 'public.audit_event'::regclass
  and polname = 'audit_event_chain_read_for_audit_writer';

select like(
  lower(pg_get_expr(polwithcheck, polrelid)),
  '%( select %current_setting%app.audit_integrity_writer%',
  'audit_integrity_check_insert_internal SELECT-wraps writer GUC'
)
from pg_catalog.pg_policy
where polrelid = 'public.audit_integrity_check'::regclass
  and polname = 'audit_integrity_check_insert_internal';

select like(
  lower(pg_get_expr(polwithcheck, polrelid)),
  '%( select %current_setting%app.audit_integrity_tenant_id%',
  'audit_integrity_check_insert_internal SELECT-wraps tenant GUC'
)
from pg_catalog.pg_policy
where polrelid = 'public.audit_integrity_check'::regclass
  and polname = 'audit_integrity_check_insert_internal';

select * from finish();

rollback;
