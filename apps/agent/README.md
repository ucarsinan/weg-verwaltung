# apps/agent — FastAPI Agent Service

**Status:** Placeholder. Implementation not started.

Planned content:

- FastAPI with a **LangGraph state-machine agent** (deterministic, traceable, testable per node)
- Tool-calls back into Supabase using the **same user JWT** that triggered the request — RLS continues to enforce tenant isolation through the agent
- **Langfuse** instrumentation on every node for traceability and prompt versioning
- **RAGAS** for retrieval-quality evaluation
- **Hard constraint:** the agent has **no service-role credentials**. Every database touch is mediated by user-level RLS. Database triggers additionally reject `actor_type = 'agent'` on critical tables — the agent literally cannot write votes, resolutions, signed protocols, or decision-register entries.

See [`../../docs/01-system-design.md`](../../docs/01-system-design.md), section 3, for the architecture; section 4.6 for the security invariants the agent must respect.
