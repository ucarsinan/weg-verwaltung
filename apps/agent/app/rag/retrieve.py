"""Hybrid retrieval: pgvector dense + Postgres FTS sparse, fused via RRF.

See docs/04-ai-architecture.md § 4.5. Setup-only scaffold; the actual SQL
needs ``public.embedding`` rows to be populated, which is a follow-up
data-pipeline task. The shape below is what ``agenda_graph`` and
``beschluss_graph`` will call once that pipeline exists.

Retrieval flow per § 4.5:
    1. embed_query(query)                                  -> vector(1024)
    2. SET hnsw.iterative_scan = 'relaxed_order'           (pgvector 0.8 trick)
    3. pgvector cosine top-k_dense                          (dense path)
    4. ts_rank_cd FTS top-k_sparse                          (sparse path)
    5. RRF fuse: score = sum(1 / (60 + rank_i)) over lists  (top 30 combined)
    6. (later) bge-reranker-v2-m3 cross-encoder -> top k_final

For now ``retrieve()`` returns ``[]`` -- the SQL would silently succeed
against the empty table and produce misleading "RAG works" signals.
Returning empty + a TODO is the honest scaffold.
"""

from __future__ import annotations

from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field

from app.tools.runtime import get_supabase

DocTyp = Literal["beschluss", "protokoll", "doku"]

# RRF constant per the original Cormack/Clarke/Buettcher 2009 paper.
# Higher values flatten the rank-bias; 60 is the standard choice.
_RRF_K: int = 60


class _RuntimeLike(Protocol):
    """Structural type for the LangGraph ``ToolRuntime`` injection."""

    config: dict[str, Any]


class RetrievedChunk(BaseModel):
    """One fused retrieval result, before re-ranking."""

    chunk_id: str = Field(..., description="UUID of the embedding row.")
    text: str = Field(..., description="Raw chunk text (without heading prefix).")
    heading_path: str = Field(..., description="Structural breadcrumb from chunk.py.")
    doc_typ: DocTyp = Field(..., description="Retrieval surface.")
    dense_rank: int | None = Field(
        None, description="1-based rank in the pgvector cosine list (None if absent)."
    )
    sparse_rank: int | None = Field(
        None, description="1-based rank in the FTS list (None if absent)."
    )
    fused_score: float = Field(..., description="RRF score across both lists.")


class HybridRetriever:
    """Two-path retrieve + RRF fuse + (TODO) bge-reranker re-rank to top-k_final.

    Wired as ``runtime``-aware so RLS still applies on the dense path -- the
    Supabase client returned by ``get_supabase`` carries the user JWT, so
    even an ``embedding`` table query is tenant-scoped without extra work
    (§ 4.5 "Mandanten-Iso gratis").
    """

    def __init__(
        self,
        runtime: _RuntimeLike,
        *,
        k_dense: int = 30,
        k_sparse: int = 30,
        k_final: int = 5,
    ) -> None:
        self.runtime = runtime
        self.k_dense = k_dense
        self.k_sparse = k_sparse
        self.k_final = k_final

    async def retrieve(
        self,
        query: str,
        *,
        weg_id: str | None = None,
        doc_typ: DocTyp | None = None,
    ) -> list[RetrievedChunk]:
        """Two-path query, RRF fuse, return top-``k_final``.

        Currently returns ``[]``. Real implementation needs:
          1. ``embed_query(query)`` -> vector(1024) -- import lazily from
             ``app.rag.embed`` to keep the optional-extra contract intact.
          2. ``SET hnsw.iterative_scan = 'relaxed_order'`` (§ 4.5 pgvector 0.8 trick)
             and ``SET hnsw.ef_search = 60`` -- per-session, not in 0010.
          3. Dense top-k_dense::

                 SELECT id, chunk_text, heading_path, doc_typ
                 FROM   public.embedding
                 WHERE  (weg_id = $1 OR $1 IS NULL)
                   AND  (doc_typ = $2 OR $2 IS NULL)
                 ORDER  BY embedding <=> $3
                 LIMIT  k_dense

          4. Sparse top-k_sparse::

                 SELECT id, chunk_text, heading_path, doc_typ,
                        ts_rank_cd(to_tsvector('german', chunk_text),
                                   plainto_tsquery('german', $4)) AS rank
                 FROM   public.embedding
                 WHERE  plainto_tsquery('german', $4)
                        @@ to_tsvector('german', chunk_text)
                   AND  (weg_id = $1 OR $1 IS NULL)
                   AND  (doc_typ = $2 OR $2 IS NULL)
                 ORDER  BY rank DESC
                 LIMIT  k_sparse

          5. RRF fuse: ``score = sum(1.0 / (60 + rank_i))`` over both lists.
          6. (later) bge-reranker-v2-m3 cross-encoder over the fused top-30
             -> top ``k_final``. Skipping this for now keeps the runtime
             dependency on FlagEmbedding behind the ``rag`` extra.
        """
        # Touch the supabase client so the JWT-presence contract is enforced
        # even on the empty-result scaffold path. This raises if the caller
        # forgot to pass ``config={'configurable': {'jwt': ...}}``.
        _ = get_supabase(self.runtime)

        # TODO(rag): wire steps 1-6 once embedding pipeline is populated.
        #            See docs/04-ai-architecture.md § 4.5 for SQL skeletons.
        _ = (query, weg_id, doc_typ)
        return []

    @staticmethod
    def _rrf_fuse(
        dense_ids: list[str],
        sparse_ids: list[str],
        k: int = _RRF_K,
    ) -> dict[str, float]:
        """Reciprocal Rank Fusion across two ranked id-lists.

        Pure-Python helper -- callable from tests once the data pipeline lands.
        Score is the sum of ``1 / (k + rank)`` across lists; absent lists
        contribute nothing. The constant ``k`` (default 60) is from the
        Cormack/Clarke/Buettcher 2009 paper.
        """
        scores: dict[str, float] = {}
        for rank, cid in enumerate(dense_ids, start=1):
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + rank)
        for rank, cid in enumerate(sparse_ids, start=1):
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + rank)
        return scores
