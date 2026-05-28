"""Unit tests for the RAG layer.

Only ``chunk_legal_text`` is exercised here -- ``embed.py`` requires the
``rag`` optional-extra (FlagEmbedding + sentence-transformers + the bge-m3
weights download) and ``retrieve.py`` needs a populated ``public.embedding``
table. Both are deferred per docs/04-ai-architecture.md § 4.11.
"""

from __future__ import annotations

import pytest

from app.rag.chunk import Chunk, chunk_legal_text

# Heuristic for "the chunker did not split mid-sentence". German legal text
# always ends a complete sentence on . / ? / ! (or, for a heading-only
# segment, a colon).
_SENTENCE_ENDINGS: tuple[str, ...] = (".", "?", "!", ":")


# ---------------------------------------------------------------------------
# Empty / trivial inputs
# ---------------------------------------------------------------------------


def test_empty_text_returns_no_chunks() -> None:
    assert chunk_legal_text("") == []
    assert chunk_legal_text("   \n\n ") == []


def test_short_beschluss_returns_single_chunk() -> None:
    """A short Beschluss-Text fits comfortably under max_tokens -> 1 chunk."""
    text = (
        "Beschluss 1 Instandhaltung der Heizungsanlage. "
        "Die Eigentümerversammlung beschließt die Beauftragung der Firma "
        "Müller GmbH zur Wartung der Heizungsanlage zu einem Pauschalbetrag "
        "von EUR 2.400."
    )
    chunks = chunk_legal_text(text)
    assert len(chunks) == 1
    chunk = chunks[0]
    assert isinstance(chunk, Chunk)
    assert "Heizungsanlage" in chunk.text
    assert chunk.heading_path.startswith("Beschluss 1")
    assert chunk.token_count > 0
    assert chunk.source_offset == 0


# ---------------------------------------------------------------------------
# Heading-path tracking
# ---------------------------------------------------------------------------


def test_hausordnung_with_paragraph_markers_tracks_heading_path() -> None:
    """A Hausordnung with multiple §-markers populates heading_path per chunk."""
    text = (
        "§1 Allgemeines\n"
        "Diese Hausordnung gilt für alle Bewohner und Besucher.\n\n"
        "§2 Ruhezeiten\n"
        "Die allgemeinen Ruhezeiten sind von 22:00 Uhr bis 07:00 Uhr.\n"
        "Mittagsruhe besteht von 13:00 Uhr bis 15:00 Uhr.\n\n"
        "§3 Reinigung\n"
        "Die Treppenhausreinigung erfolgt wöchentlich nach Reinigungsplan.\n\n"
        "§4 Lärmschutz\n"
        "Musikinstrumente dürfen außerhalb der Ruhezeiten gespielt werden, "
        "jedoch nicht länger als zwei Stunden täglich.\n"
    )
    chunks = chunk_legal_text(text)
    assert len(chunks) >= 4
    paths = {c.heading_path for c in chunks}
    # All four §-headings must show up somewhere.
    assert any("§1" in p for p in paths)
    assert any("§4" in p for p in paths)
    # heading_path is never empty when there is a structural marker.
    assert all(c.heading_path for c in chunks)


def test_numbered_subheadings_build_breadcrumb() -> None:
    """Numbered headings (1., 1.1, 1.2) compose into a multi-level path."""
    text = (
        "1. Wirtschaftsplan\n"
        "Der Wirtschaftsplan wird für das laufende Kalenderjahr aufgestellt.\n\n"
        "1.1 Einnahmen\n"
        "Die Einnahmen setzen sich aus Hausgeldzahlungen der Eigentümer zusammen.\n\n"
        "1.2 Ausgaben\n"
        "Die Ausgaben umfassen Instandhaltung, Verwaltung und Versicherungen.\n"
    )
    chunks = chunk_legal_text(text)
    # At least one chunk should carry a multi-level breadcrumb.
    multilevel = [c for c in chunks if " > " in c.heading_path]
    assert multilevel, f"expected hierarchical path, got: {[c.heading_path for c in chunks]}"


# ---------------------------------------------------------------------------
# Sentence-boundary safety (the pathological case)
# ---------------------------------------------------------------------------


def test_long_single_paragraph_never_splits_mid_sentence() -> None:
    """A wall of text without structural markers still respects sentence boundaries."""
    # Force ~30 sentences in one paragraph, well above max_tokens.
    sentence = (
        "Die Eigentümerversammlung beschließt die Beauftragung der "
        "Hausverwaltung mit der Durchführung der jährlichen Heizkostenabrechnung. "
    )
    text = sentence * 60  # large enough to trigger sentence-level splitting
    chunks = chunk_legal_text(text, max_tokens=128, overlap_tokens=0)
    assert len(chunks) >= 2, "expected multiple chunks under tight max_tokens"
    for c in chunks:
        stripped = c.text.rstrip()
        assert stripped.endswith(_SENTENCE_ENDINGS), (
            f"chunk ends mid-sentence: ...{stripped[-60:]!r}"
        )


# ---------------------------------------------------------------------------
# Overlap continuity
# ---------------------------------------------------------------------------


def test_adjacent_chunks_share_overlap_words() -> None:
    """Each chunk includes the tail of the previous one as a context prefix."""
    # 80 distinct sentences, each unique enough that overlap is detectable.
    sentences = [f"Satz Nummer {i} mit eindeutigen Worten." for i in range(80)]
    text = " ".join(sentences)
    chunks = chunk_legal_text(text, max_tokens=64, overlap_tokens=20)
    assert len(chunks) >= 2

    # Pick two adjacent chunks and verify shared tokens (>0).
    a, b = chunks[0], chunks[1]
    a_tail_words = set(a.text.split()[-10:])
    b_head_words = set(b.text.split()[:10])
    shared = a_tail_words & b_head_words
    assert shared, (
        f"expected overlap words between adjacent chunks; "
        f"a-tail={a_tail_words!r} b-head={b_head_words!r}"
    )


def test_overlap_zero_means_no_shared_words() -> None:
    """``overlap_tokens=0`` produces strictly disjoint adjacent chunks."""
    sentences = [f"Eindeutiger Satz {i} Ende." for i in range(60)]
    text = " ".join(sentences)
    chunks = chunk_legal_text(text, max_tokens=48, overlap_tokens=0)
    assert len(chunks) >= 2
    a, b = chunks[0], chunks[1]
    # First word of b should NOT appear at the very tail of a.
    assert b.text.split()[0] not in a.text.split()[-3:]


# ---------------------------------------------------------------------------
# Token-count sanity
# ---------------------------------------------------------------------------


def test_token_count_is_monotonic_with_length() -> None:
    """Longer chunks must have a non-decreasing token_count."""
    short = chunk_legal_text("§1 Kurz. Ein Satz.")[0]
    longer_text = "§1 Lang. " + ("Ein vollständiger Satz. " * 30)
    longer = chunk_legal_text(longer_text)[0]
    assert longer.token_count > short.token_count


# ---------------------------------------------------------------------------
# Deferred -- needs the rag extras / populated DB.
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="needs --extra rag (FlagEmbedding + bge-m3 weights)")
def test_embed_query_dimension() -> None:  # pragma: no cover
    from app.rag.embed import embed_query

    vec = embed_query("Wann ist die nächste Eigentümerversammlung?")
    assert len(vec) == 1024


@pytest.mark.skip(reason="needs --extra rag + populated public.embedding")
def test_hybrid_retriever_returns_top_k() -> None:  # pragma: no cover
    # Sketch: would build a fake _RuntimeLike, populate embedding rows,
    # call retriever.retrieve(...), and assert len(result) <= k_final.
    pass
