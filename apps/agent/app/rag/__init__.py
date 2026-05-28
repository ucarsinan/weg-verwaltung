"""Retrieval-augmented generation layer.

See docs/04-ai-architecture.md § 4.5. Provides:
- chunk: structural-first chunking for German legal text
- embed: bge-m3 embedding (opt-in; install with ``uv sync --extra rag``)
- retrieve: hybrid (pgvector + Postgres FTS) with RRF fusion

``embed`` is **not** re-exported here: importing it eagerly would pull in
``FlagEmbedding`` + ``sentence-transformers``, which we deliberately keep
behind the ``rag`` optional-extra (§ 4.11 honest-unknown about
self-host cost). ``retrieve.py`` imports it lazily.
"""

from app.rag.chunk import Chunk, chunk_legal_text
from app.rag.retrieve import HybridRetriever, RetrievedChunk

__all__ = ["Chunk", "HybridRetriever", "RetrievedChunk", "chunk_legal_text"]
