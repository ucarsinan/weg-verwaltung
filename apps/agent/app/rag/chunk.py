"""Structural-first chunking for German legal / administrative text.

Implements § 4.5 exactly:
    1. Split on structural markers first (§, Abschnitt, TOP, Beschluss N, "1.", "1.1").
    2. Recursively split oversize sections by paragraph -> sentence (never mid-sentence).
    3. Target ~512 tokens, ~15% overlap (~75 tokens). German compounds inflate
       char-counts ~20%, so we measure in tokens, approximated as
       ``len(words) * 1.3``.
    4. Track heading_path and prepend at retrieval time, not here -- stored
       separately on the embedding row (see 0010_embedding_layer.sql).

Footgun §4.5 #1: NEVER share BM25 and embedding preprocessing. This module is
for the dense embedding path only; the BM25 path uses Postgres FTS natively
on the raw ``chunk_text`` column.

Footgun §4.5 #2: bge-m3 requires "query: " / "passage: " prefixing at embed
time -- applied in ``embed.py``, NOT here.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, Field

# Token approximation: avg German word ≈ 1.3 sub-word tokens for bge-m3 /
# multilingual tokenizers. Production code should swap this for the actual
# bge-m3 tokenizer (or ``tiktoken`` if we ever fall back to OpenAI embeddings).
_TOKENS_PER_WORD: float = 1.3

# Structural-marker regex (re.MULTILINE).
#   §<digits>            -> WEG / Hausordnung paragraph heading
#   TOP <digits>         -> Versammlungs-TOP heading
#   Beschluss <digits>   -> Beschluss-Sammlung entry heading
#   <digits>.<digits?>.  -> numbered headings: "1.", "1.1", "2.3."
_STRUCTURAL_RE = re.compile(
    r"^(?:§\s*\d+|TOP\s+\d+|Beschluss\s+\d+|\d+\.\d*\.?\s)",
    re.MULTILINE,
)

# Sentence boundary -- ".", "?", "!" followed by whitespace and an
# uppercase letter (or end-of-string). Conservative to avoid splitting on
# abbreviations like "z. B." -- we accept slightly long chunks over breaking
# legal sentences mid-clause.
_SENTENCE_BOUNDARY_RE = re.compile(r"(?<=[.?!])\s+(?=[A-ZÄÖÜ])")


class Chunk(BaseModel):
    """One retrieval-ready chunk."""

    text: str = Field(..., description="Chunk body (without heading prefix).")
    heading_path: str = Field(
        ...,
        description='Hierarchical heading path, e.g. "Hausordnung > §4 Lärmschutz".',
    )
    token_count: int = Field(..., ge=0, description="Approximate bge-m3 token count.")
    source_offset: int = Field(
        ...,
        ge=0,
        description="Character offset in the original document, for back-refs.",
    )


def _approx_tokens(text: str) -> int:
    """Approximate bge-m3 token count.

    Placeholder: ``len(words) * 1.3``. Production code should use the actual
    bge-m3 tokenizer (or tiktoken). The approximation is safe for *budgeting*
    (it slightly over-counts, so chunks stay under ``max_tokens``) but not
    for cost projection.
    """
    if not text:
        return 0
    words = text.split()
    return int(len(words) * _TOKENS_PER_WORD)


def _classify_heading(line: str) -> tuple[int, str] | None:
    """Return ``(level, heading)`` for a structural-marker line, else ``None``.

    Levels:
        1 -> § / TOP / Beschluss / "1."  (top-level section)
        2 -> "1.1"                       (sub-section)
        3 -> "1.1.1"                     (sub-sub-section)
    """
    stripped = line.strip()
    if not stripped:
        return None

    # §, TOP, Beschluss -> always level 1.
    if re.match(r"^(?:§\s*\d+|TOP\s+\d+|Beschluss\s+\d+)", stripped):
        return (1, stripped.split("\n", 1)[0])

    # Numbered: count dots before whitespace. "1." -> level 1, "1.1" -> 2, etc.
    m = re.match(r"^(\d+(?:\.\d+)*)\.?\s", stripped)
    if m:
        depth = m.group(1).count(".") + 1
        return (min(depth, 3), stripped.split("\n", 1)[0])

    return None


def _build_heading_path(stack: list[str | None]) -> str:
    """Render the active heading stack as a breadcrumb."""
    return " > ".join(h for h in stack if h)


def _split_on_structure(text: str) -> list[tuple[int, str]]:
    """Split ``text`` on structural markers. Returns ``[(char_offset, segment), ...]``.

    Each segment starts with the marker line (so the heading line is part of
    the segment and survives downstream chunking).
    """
    matches = list(_STRUCTURAL_RE.finditer(text))
    if not matches:
        return [(0, text)]

    segments: list[tuple[int, str]] = []
    # Preamble before the first structural marker (cover-page / boilerplate).
    if matches[0].start() > 0:
        segments.append((0, text[: matches[0].start()]))
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        segments.append((start, text[start:end]))
    return segments


def _split_oversize_segment(segment: str, max_tokens: int) -> list[str]:
    """Recursively split an oversize segment.

    Order: paragraph (``\\n\\n``) -> sentence boundary. NEVER mid-sentence.
    If a single sentence still exceeds ``max_tokens`` we keep it whole --
    breaking it would corrupt the embedding more than the size budget
    overrun costs us at retrieval time.
    """
    if _approx_tokens(segment) <= max_tokens:
        return [segment]

    # Step 1: paragraphs.
    paragraphs = re.split(r"\n{2,}", segment)
    pieces: list[str] = []
    buf = ""
    for para in paragraphs:
        if not para.strip():
            continue
        candidate = (buf + "\n\n" + para).strip() if buf else para
        if _approx_tokens(candidate) <= max_tokens:
            buf = candidate
        else:
            if buf:
                pieces.append(buf)
            # Paragraph alone may still overflow -> sentence split.
            if _approx_tokens(para) > max_tokens:
                pieces.extend(_split_by_sentence(para, max_tokens))
                buf = ""
            else:
                buf = para
    if buf:
        pieces.append(buf)
    return pieces


def _split_by_sentence(text: str, max_tokens: int) -> list[str]:
    """Pack sentences into ≤``max_tokens`` groups without splitting mid-sentence."""
    sentences = _SENTENCE_BOUNDARY_RE.split(text)
    out: list[str] = []
    buf = ""
    for s in sentences:
        candidate = (buf + " " + s).strip() if buf else s
        if _approx_tokens(candidate) <= max_tokens:
            buf = candidate
        else:
            if buf:
                out.append(buf)
            buf = s  # may itself exceed max_tokens -- accepted (see docstring)
    if buf:
        out.append(buf)
    return out


def _take_overlap_tail(text: str, overlap_tokens: int) -> str:
    """Return the last ~``overlap_tokens`` worth of words from ``text``."""
    if overlap_tokens <= 0 or not text:
        return ""
    words = text.split()
    # Inverse of _approx_tokens: words ≈ tokens / 1.3
    n_words = max(1, int(overlap_tokens / _TOKENS_PER_WORD))
    return " ".join(words[-n_words:])


def chunk_legal_text(
    text: str,
    max_tokens: int = 512,
    overlap_tokens: int = 75,
) -> list[Chunk]:
    """Structural-first chunking per § 4.5.

    Args:
        text: Raw document content (Beschluss, Protokoll, Hausordnung, ...).
        max_tokens: Target chunk size in approximate bge-m3 tokens (default 512).
        overlap_tokens: Token-count of the prefix carried over from the
            previous chunk for context continuity (default 75 = ~15%).

    Returns:
        Ordered list of ``Chunk`` objects. ``heading_path`` reflects the
        most recently seen structural marker at each level. Adjacent chunks
        share the last ``overlap_tokens`` of the previous chunk as a prefix.
    """
    if not text or not text.strip():
        return []

    chunks: list[Chunk] = []
    heading_stack: list[str | None] = [None, None, None]  # 3 levels

    segments = _split_on_structure(text)
    prev_chunk_text: str = ""

    for seg_offset, segment in segments:
        # Update heading stack from the segment's first line if it's a marker.
        first_line = segment.split("\n", 1)[0]
        classified = _classify_heading(first_line)
        if classified is not None:
            level, heading = classified
            heading_stack[level - 1] = heading
            # Lower levels reset when a higher level changes.
            for i in range(level, 3):
                heading_stack[i] = None

        heading_path = _build_heading_path(heading_stack)

        # Step 2: split oversize segments at paragraph -> sentence boundaries.
        pieces = _split_oversize_segment(segment, max_tokens)

        # Step 5: overlap prefix from the previous chunk's tail.
        for piece in pieces:
            piece_stripped = piece.strip()
            if not piece_stripped:
                continue
            overlap_prefix = _take_overlap_tail(prev_chunk_text, overlap_tokens)
            body = (
                f"{overlap_prefix}\n\n{piece_stripped}" if overlap_prefix else piece_stripped
            )
            chunks.append(
                Chunk(
                    text=body,
                    heading_path=heading_path,
                    token_count=_approx_tokens(body),
                    source_offset=seg_offset,
                )
            )
            prev_chunk_text = piece_stripped

    return chunks
