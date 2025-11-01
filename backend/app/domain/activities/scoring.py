"""Scoring helpers for mini-activities."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, Tuple


def _levenshtein(a: str, b: str) -> int:
	if a == b:
		return 0
	if not a:
		return len(b)
	if not b:
		return len(a)
	prev = list(range(len(b) + 1))
	for i, char_a in enumerate(a, start=1):
		curr = [i]
		for j, char_b in enumerate(b, start=1):
			cost = 0 if char_a == char_b else 1
			curr.append(min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost))
		prev = curr
	return prev[-1]


def typing_stats(prompt: str, submitted: str, duration_s: float) -> Tuple[float, float, float]:
	max_len = max(len(prompt), 1)
	distance = _levenshtein(prompt, submitted)
	correct_chars = max(max_len - distance, 0)
	accuracy = correct_chars / max_len
	minutes = max(duration_s / 60.0, 1e-3)
	wpm = (correct_chars / 5.0) / minutes
	score = round(wpm * accuracy, 2)
	return score, round(accuracy, 4), round(wpm, 2)


def typing_scores(prompt: str, submissions: Dict[str, str], duration_s: float) -> Dict[str, float]:
	scores: Dict[str, float] = {}
	for user_id, text in submissions.items():
		score, _, _ = typing_stats(prompt, text, duration_s)
		scores[user_id] = score
	return scores


@dataclass(slots=True)
class TriviaOutcome:
	correct_totals: Dict[str, int]
	latency_totals: Dict[str, int]


def trivia_scores(
	answers: Iterable[Tuple[str, int, int]],
	*,
	correct_idx: int,
) -> TriviaOutcome:
	totals: Dict[str, int] = {}
	latencies: Dict[str, int] = {}
	for user_id, choice_idx, latency_ms in answers:
		if choice_idx == correct_idx:
			totals[user_id] = totals.get(user_id, 0) + 1
		latencies[user_id] = latencies.get(user_id, 0) + latency_ms
	return TriviaOutcome(correct_totals=totals, latency_totals=latencies)


def rps_round_winner(choice_a: str, choice_b: str) -> int:
	beats = {
		"rock": "scissors",
		"paper": "rock",
		"scissors": "paper",
	}
	if choice_a == choice_b:
		return 0
	return 1 if beats.get(choice_a) == choice_b else -1


def rps_match_winner(results: Iterable[int], best_of: int) -> int:
	needed = (best_of // 2) + 1
	score = 0
	for result in results:
		score += result
		if score >= needed:
			return 1
		if score <= -needed:
			return -1
	return 0
