from app.services.ingestion import chunk_pages


def test_chunking_overlap_and_pages():
    pages = [(1, "Sentence one. " * 200), (2, "Second page text. " * 100)]
    chunks = chunk_pages(pages, 500, 80)
    assert chunks and all(len(c[1]) <= 500 for c in chunks)
    assert {c[0] for c in chunks} == {1, 2}


def test_empty_pages_skipped():
    assert chunk_pages([(1, "   \n\n "), (2, "")], 500, 50) == []
