"""Prompt helpers for typing duel and collaborative story."""

from __future__ import annotations

import random


_TYPING_PROMPTS = [
	"The quick brown fox jumps over the lazy dog to test the keyboard layout.",
	"Collaborating remotely requires clear communication and shared focus.",
	"Typing speed improves with deliberate practice and ergonomic posture.",
]

_STORY_SEEDS = [
	"You wake up in a library where every book describes a future that has not yet happened.",
	"Two friends find a map that changes itself whenever they make a decision.",
	"A mysterious letter invites the pair to solve a puzzle before midnight.",
]

_ROMANCE_SCENARIOS = [
	"In a bustling high school hallway, a boy and a girl lock eyes. They've been secretly admiring each other for months, but neither has made a move. Today, the school dance is announced.",
	"During a rainy afternoon in the school library, two students reach for the same book. Their hands touch, and a spark flies. They realize they share a love for obscure poetry.",
	"It's the last day of summer camp. A boy and a girl sit by the lake, skipping stones. They promised to write to each other, but the distance seems daunting.",
]


def pick_typing() -> str:
	return random.choice(_TYPING_PROMPTS)


def pick_story_seed() -> str:
	return random.choice(_STORY_SEEDS)


def pick_romance_scenario() -> str:
	return random.choice(_ROMANCE_SCENARIOS)
