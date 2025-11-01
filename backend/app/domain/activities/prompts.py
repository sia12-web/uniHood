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


def pick_typing() -> str:
	return random.choice(_TYPING_PROMPTS)


def pick_story_seed() -> str:
	return random.choice(_STORY_SEEDS)
