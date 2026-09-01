import pytest

from app.utils.text_chunker import chunk_text, normalize_text


def test_empty_text_produces_no_chunks():
    assert chunk_text("") == []
    assert chunk_text("   \n\n  ") == []


def test_short_text_is_a_single_chunk():
    chunks = chunk_text("Hello world.", chunk_size=500, chunk_overlap=50)
    assert chunks == ["Hello world."]


def test_chunks_cover_the_whole_text():
    text = " ".join(f"word{i}" for i in range(2000))
    chunks = chunk_text(text, chunk_size=300, chunk_overlap=50)

    assert len(chunks) > 1
    assert chunks[0].startswith("word0")
    assert chunks[-1].endswith("word1999")


def test_chunks_respect_the_size_limit():
    text = " ".join(f"word{i}" for i in range(2000))
    for chunk in chunk_text(text, chunk_size=300, chunk_overlap=50):
        assert len(chunk) <= 300


@pytest.mark.parametrize(
    "size,overlap",
    [(100, 100), (100, 200), (100, 999), (1, 1), (5, 5)],
)
def test_overlap_at_or_above_chunk_size_terminates(size, overlap):
    """
    The original implementation looped forever whenever overlap >= chunk_size,
    because `start = end - overlap` never advanced.
    """
    text = "a" * 5000
    chunks = chunk_text(text, chunk_size=size, chunk_overlap=overlap)
    assert chunks
    assert len(chunks) < 10000


def test_negative_values_do_not_crash():
    chunks = chunk_text("some text here", chunk_size=-5, chunk_overlap=-5)
    assert chunks


def test_prefers_sentence_boundaries():
    text = ("This is sentence one. " * 20).strip()
    chunks = chunk_text(text, chunk_size=120, chunk_overlap=20)
    # Every chunk but the last should stop at a sentence end.
    assert all(c.endswith(".") for c in chunks[:-1])


def test_chunks_overlap_so_context_is_not_lost():
    text = " ".join(f"w{i}" for i in range(500))
    chunks = chunk_text(text, chunk_size=200, chunk_overlap=60)
    assert len(chunks) >= 2
    # The tail of one chunk should reappear at the head of the next.
    tail_word = chunks[0].split()[-1]
    assert tail_word in chunks[1]


def test_normalize_collapses_pdf_whitespace():
    assert normalize_text("a  \t b\r\n\r\n\r\nc\f d") == "a b\n\nc\nd"
