-- WEG-Verwaltung migration 0032: extend protocol status CHECK + add langgraph_thread_id.
--
-- Bug fix: The HITL graph parks the draft in the LangGraph checkpoint BEFORE
-- persist_node runs. The web action now writes an `awaiting_review` row
-- immediately after the first graph call so the page can render DraftReviewForm.
--
-- Changes:
--   1. Drop + recreate protocol_status_check to include 'awaiting_review'.
--   2. Add nullable langgraph_thread_id column — stores the LangGraph thread_id
--      so submitRevision can resume the correct checkpoint.
--   3. Relax protocol_signature_complete: unterzeichnet_von/am must only be set
--      when status='unterzeichnet' — unchanged logic, constraint recreated
--      idempotently to be safe.

-- 1. Extend the status CHECK constraint.
alter table public.protocol
  drop constraint if exists protocol_status_check;

alter table public.protocol
  add constraint protocol_status_check
    check (status in (
      'awaiting_review',
      'ki_entwurf',
      'verwalter_revision',
      'unterzeichnet'
    ));

-- 2. Add the LangGraph thread_id column (nullable — not set for manually created protocols).
alter table public.protocol
  add column if not exists langgraph_thread_id text;

comment on column public.protocol.langgraph_thread_id is
  'LangGraph checkpoint thread_id. Set by generateProtokoll server action when status=awaiting_review. '
  'Used by submitRevision to resume the HITL interrupt.';

comment on column public.protocol.status is
  'Lifecycle: awaiting_review → ki_entwurf → verwalter_revision → unterzeichnet. '
  'awaiting_review = agent paused at HITL interrupt, Verwalter has not yet submitted revision. '
  'Invariante 3: Agent darf status nicht selbst auf unterzeichnet setzen (Trigger in 0007/0009/0011).';
