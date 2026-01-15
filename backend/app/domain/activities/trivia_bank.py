"""In-memory trivia question bank with deterministic sampling."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import List


@dataclass(slots=True)
class TriviaItem:
	id: str
	prompt: str
	options: tuple[str, str, str, str]
	correct_idx: int


_BANK: List[TriviaItem] = [
	TriviaItem(
		id="q1",
		prompt="Which planet is known as the Red Planet?",
		options=("Venus", "Mars", "Jupiter", "Mercury"),
		correct_idx=1,
	),
	TriviaItem(
		id="q2",
		prompt="Which language is primarily used for web browser styling?",
		options=("HTML", "Python", "CSS", "SQL"),
		correct_idx=2,
	),
	TriviaItem(
		id="q3",
		prompt="What is the capital city of Canada?",
		options=("Toronto", "Vancouver", "Montreal", "Ottawa"),
		correct_idx=3,
	),
	TriviaItem(
		id="q4",
		prompt="How many continents are there on Earth?",
		options=("5", "6", "7", "8"),
		correct_idx=2,
	),
	TriviaItem(
		id="q5",
		prompt="What gas do plants absorb from the atmosphere?",
		options=("Oxygen", "Carbon Dioxide", "Nitrogen", "Helium"),
		correct_idx=1,
	),
	TriviaItem(
		id="q6",
		prompt="Who painted the Mona Lisa?",
		options=("Michelangelo", "Leonardo da Vinci", "Raphael", "Donatello"),
		correct_idx=1,
	),
]


def get_random_items(count: int, *, seed: int | None = None) -> List[TriviaItem]:
	rng = random.Random(seed)
	return rng.sample(_BANK, k=min(count, len(_BANK)))


def get_question(question_id: str) -> TriviaItem | None:
	for item in _BANK:
		if item.id == question_id:
			return item
	return None
