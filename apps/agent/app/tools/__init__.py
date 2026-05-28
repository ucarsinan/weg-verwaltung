"""Tool inventory shared across all four graphs (§ 4.3).

Tools are imported by graphs, never defined inline — keeps the side-effect
audit (§ 4.3) auditable from one directory.

The MVP ``beschluss_graph`` calls no tools (pure analysis), but the runtime
scaffolding lives here so subsequent graphs (agenda, protokoll, frist) can
plug in without reshaping the package.
"""

from app.tools.runtime import SideEffectScope, get_supabase, side_effect

__all__ = ["SideEffectScope", "get_supabase", "side_effect"]
