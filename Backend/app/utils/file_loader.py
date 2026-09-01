import logging
import os

from pypdf import PdfReader
from pypdf.errors import PdfReadError

logger = logging.getLogger(__name__)

PDF_MAGIC = b"%PDF-"
# UTF-16/32 text is full of null bytes, so it has to be recognised before the
# "contains a null byte means binary" heuristic below rejects it.
TEXT_BOMS = (
    b"\xff\xfe\x00\x00",
    b"\x00\x00\xfe\xff",
    b"\xff\xfe",
    b"\xfe\xff",
    b"\xef\xbb\xbf",
)


class UnsupportedFileError(ValueError):
    """Raised for a file we cannot extract text from."""


def sniff_kind(file_path: str) -> str:
    """
    Determines the file kind from its first bytes rather than its extension,
    so a renamed binary cannot slip through as a .txt.
    """
    with open(file_path, "rb") as f:
        head = f.read(1024)

    if head.startswith(PDF_MAGIC):
        return "pdf"

    if head.startswith(TEXT_BOMS):
        return "txt"

    if b"\x00" in head:
        raise UnsupportedFileError("File appears to be binary, not a PDF or text file")

    return "txt"


def load_text_from_file(file_path: str) -> str:
    """Extracts plain text from a PDF or text file."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    kind = sniff_kind(file_path)
    logger.info("Loading %s file: %s", kind, os.path.basename(file_path))

    if kind == "pdf":
        return _load_pdf(file_path)
    return _load_txt(file_path)


def _load_pdf(file_path: str) -> str:
    try:
        reader = PdfReader(file_path)
    except PdfReadError as e:
        raise UnsupportedFileError(f"Could not read PDF: {e}") from e

    if getattr(reader, "is_encrypted", False):
        # An empty user password is common for "protected" PDFs and is worth a try.
        try:
            if not reader.decrypt(""):
                raise UnsupportedFileError(
                    "This PDF is password protected. Please upload an unlocked copy."
                )
        except (PdfReadError, NotImplementedError) as e:
            raise UnsupportedFileError(
                "This PDF is password protected. Please upload an unlocked copy."
            ) from e

    pages = []
    for i, page in enumerate(reader.pages):
        try:
            pages.append(page.extract_text() or "")
        except Exception as e:  # a single corrupt page should not fail the upload
            logger.warning("Skipping unreadable page %s of %s: %s", i + 1, file_path, e)

    text = "\n\n".join(p for p in pages if p.strip())

    if not text.strip():
        raise UnsupportedFileError(
            "No selectable text found in this PDF. Scanned images are not supported yet."
        )

    logger.info("Extracted %s characters from %s pages", len(text), len(reader.pages))
    return text


def _load_txt(file_path: str) -> str:
    for encoding in ("utf-8", "utf-8-sig", "utf-16", "latin-1"):
        try:
            with open(file_path, "r", encoding=encoding) as f:
                text = f.read()
            logger.info("Extracted %s characters using %s", len(text), encoding)
            return text
        except UnicodeDecodeError:
            continue

    raise UnsupportedFileError("Could not decode this text file")
