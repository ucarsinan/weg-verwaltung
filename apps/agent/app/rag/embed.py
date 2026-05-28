"""bge-m3 embedding via FlagEmbedding. Opt-in (install with ``--extra rag``).

See docs/04-ai-architecture.md § 4.5 (primary embedding choice) and § 4.11
(self-host cost on Fly.io Frankfurt not yet profiled -- hence opt-in).

This module is **not** imported by ``app.rag.__init__`` to keep the base
FastAPI install lightweight. Call sites import it lazily:

    from app.rag.embed import embed_query, embed_passages

Footgun § 4.5 #2: bge-m3 needs ``"query: "`` and ``"passage: "`` prefixing
on the input strings. Skipping this on the query side silently tanks recall
by ~15 % -- looks like "model is bad at German" but is a wiring bug. We
apply the prefixes here so call sites can't forget.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING, Any, Sequence

if TYPE_CHECKING:
    # The real type lives in FlagEmbedding; we only need it for annotations.
    from FlagEmbedding import BGEM3FlagModel  # noqa: F401


@lru_cache(maxsize=1)
def _get_model() -> Any:
    """Lazy-init the bge-m3 model. Cached process-wide.

    Raises:
        ImportError: if the ``rag`` optional-extra is not installed.
            Message points the operator at § 4.11 (still-profiling cost).
    """
    try:
        from FlagEmbedding import BGEM3FlagModel
    except ImportError as e:  # pragma: no cover -- env-dependent
        raise ImportError(
            "RAG extras not installed. Run `uv sync --extra rag` or see "
            "docs/04-ai-architecture.md § 4.11 -- self-host cost still profiling."
        ) from e
    return BGEM3FlagModel("BAAI/bge-m3", use_fp16=True)


def embed_query(text: str) -> list[float]:
    """Embed a single query string with the required ``"query: "`` prefix.

    Returns a 1024-dim dense vector (matches ``vector(1024)`` in
    0010_embedding_layer.sql).
    """
    model = _get_model()
    result = model.encode([f"query: {text}"])
    return list(result["dense_vecs"][0].tolist())


def embed_passages(texts: Sequence[str]) -> list[list[float]]:
    """Batch-embed passages with the required ``"passage: "`` prefix.

    Args:
        texts: Iterable of chunk bodies (e.g. ``Chunk.text`` values).

    Returns:
        Parallel list of 1024-dim dense vectors.
    """
    model = _get_model()
    prefixed = [f"passage: {t}" for t in texts]
    result = model.encode(prefixed)
    return [list(v.tolist()) for v in result["dense_vecs"]]
