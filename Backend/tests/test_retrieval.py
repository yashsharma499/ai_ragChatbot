"""
Relevance filtering.

A fixed absolute cutoff used to discard legitimate matches: cosine similarity
between a short question and a long passage is naturally low, so a real answer
in a small document could score ~0.12 and the user was told nothing relevant
existed. Matches are now judged against the best hit for that query.
"""

import pytest

from app.config import Config
from app.services.vector_service import VectorService


def match(score, id_="v"):
    return {"id": id_, "score": score, "metadata": {}}


filter_by_relevance = VectorService._filter_by_relevance


def test_no_candidates_returns_nothing():
    assert filter_by_relevance([], 0.0) == []


def test_a_lone_weak_but_plausible_match_is_kept():
    """The regression this filter exists for."""
    kept = filter_by_relevance([match(0.12)], Config.RAG_MIN_SCORE)
    assert len(kept) == 1


def test_a_query_with_no_signal_is_rejected():
    kept = filter_by_relevance([match(0.02), match(0.01)], Config.RAG_MIN_SCORE)
    assert kept == []


def test_results_come_back_in_relevance_order():
    # All three are within the relative cutoff, so ordering is what is tested.
    kept = filter_by_relevance(
        [match(0.7, "b"), match(0.9, "a"), match(0.8, "c")], Config.RAG_MIN_SCORE
    )
    assert [m["id"] for m in kept] == ["a", "c", "b"]


def test_matches_far_below_the_best_are_dropped():
    kept = filter_by_relevance(
        [match(0.9, "strong"), match(0.85, "close"), match(0.11, "unrelated")],
        Config.RAG_MIN_SCORE,
    )
    assert [m["id"] for m in kept] == ["strong", "close"]


def test_the_top_hit_always_survives(monkeypatch):
    monkeypatch.setattr(Config, "RAG_RELATIVE_RATIO", 0.99)
    kept = filter_by_relevance([match(0.5, "top"), match(0.2, "weak")], 0.9)
    assert [m["id"] for m in kept] == ["top"]


@pytest.mark.parametrize("scores", [[0.9, 0.9, 0.9], [0.3, 0.29, 0.28]])
def test_evenly_scored_matches_are_all_kept(scores):
    kept = filter_by_relevance(
        [match(s, str(i)) for i, s in enumerate(scores)], Config.RAG_MIN_SCORE
    )
    assert len(kept) == len(scores)


def test_absolute_min_score_still_applies(monkeypatch):
    kept = filter_by_relevance([match(0.9, "a"), match(0.6, "b")], 0.8)
    assert [m["id"] for m in kept] == ["a"]
