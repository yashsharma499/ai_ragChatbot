import re
from typing import List, Optional

from app.config import Config

# Prefer to break at a paragraph, then a sentence, then any whitespace.
_BREAK_PATTERNS = [
    re.compile(r"\n\s*\n"),
    re.compile(r"(?<=[.!?])\s"),
    re.compile(r"\s"),
]


def normalize_text(text: str) -> str:
    """
    PDF extraction leaves ragged whitespace and stray form feeds behind, which
    both bloats chunks and hurts embedding quality.
    """
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\f", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _find_break(text: str, start: int, end: int) -> int:
    """
    Returns the best index to cut at within `text[start:end]`, preferring a
    natural boundary in the last third of the window. Returns `end` when no
    good boundary exists.
    """
    window_start = start + (end - start) * 2 // 3

    for pattern in _BREAK_PATTERNS:
        best = -1
        for match in pattern.finditer(text, window_start, end):
            best = match.end()
        if best > start:
            return best

    return end


def chunk_text(
    text: str,
    chunk_size: Optional[int] = None,
    chunk_overlap: Optional[int] = None,
) -> List[str]:
    """
    Splits text into overlapping chunks that end on natural boundaries where
    possible.

    Defaults come from Config so tuning is a single env-var change. The overlap
    is clamped below the chunk size, which is what previously allowed an
    infinite loop when the two were configured too close together.
    """
    chunk_size = chunk_size if chunk_size is not None else Config.CHUNK_SIZE
    chunk_overlap = chunk_overlap if chunk_overlap is not None else Config.CHUNK_OVERLAP

    chunk_size = max(1, int(chunk_size))
    chunk_overlap = max(0, int(chunk_overlap))
    # Guarantees forward progress on every iteration.
    chunk_overlap = min(chunk_overlap, chunk_size - 1)

    text = normalize_text(text)
    if not text:
        return []

    chunks: List[str] = []
    start = 0
    length = len(text)

    while start < length:
        end = min(start + chunk_size, length)

        if end < length:
            end = _find_break(text, start, end)

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= length:
            break

        start = max(end - chunk_overlap, start + 1)

    return chunks
