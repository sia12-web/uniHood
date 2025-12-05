import hashlib

import pytest
import pytest_asyncio

from app.domain.activities import policy, schemas
from app.domain.activities.service import ActivitiesService, reset_memory_state
from app.infra.auth import AuthenticatedUser


class UserFactory:
	def __init__(self, user_id: str, campus_id: str = "campus-1") -> None:
		self.user_id = user_id
		self.campus_id = campus_id

	def to_user(self) -> AuthenticatedUser:
		return AuthenticatedUser(id=self.user_id, campus_id=self.campus_id)


@pytest_asyncio.fixture(autouse=True)
async def reset_memory():
	await reset_memory_state()
	yield


@pytest.fixture(autouse=True)
def mock_friendship(monkeypatch):
	async def _ok(_user_a: str, _user_b: str) -> None:
		return None

	monkeypatch.setattr(policy, "ensure_friends", _ok)
	yield


@pytest.mark.asyncio
async def test_typing_duel_full_flow():
	service = ActivitiesService()
	initiator = UserFactory("alice").to_user()
	peer = UserFactory("bob").to_user()

	request = schemas.CreateActivityRequest(kind="typing_duel")
	summary = await service.create_activity(initiator, peer.id, request)
	assert summary.state == "lobby"

	started = await service.start_activity(initiator, summary.id)
	assert started.state == "active"

	detail = await service.get_activity(initiator, summary.id)
	assert detail.rounds
	prompt = str(detail.rounds[0].meta.get("prompt"))
	assert prompt

	board = await service.submit_typing(
		initiator,
		schemas.TypingSubmitRequest(activity_id=summary.id, round_idx=1, text=prompt),
	)
	assert board.totals[initiator.id] == pytest.approx(0.0)

	final_board = await service.submit_typing(
		peer,
		schemas.TypingSubmitRequest(activity_id=summary.id, round_idx=1, text=prompt),
	)
	assert final_board.totals[initiator.id] >= 0.0
	assert final_board.totals[peer.id] >= 0.0
	assert 1 in final_board.per_round

	detail = await service.get_activity(initiator, summary.id)
	assert detail.state == "completed"


@pytest.mark.asyncio
async def test_story_builder_completes_after_turns():
	service = ActivitiesService()
	user_a = UserFactory("alice").to_user()
	user_b = UserFactory("bob").to_user()

	options = schemas.ActivityOptions(story=schemas.StoryOptions(turns=4, turn_seconds=15))
	summary = await service.create_activity(user_a, user_b.id, schemas.CreateActivityRequest(kind="story_builder", options=options))
	await service.start_activity(user_a, summary.id)

	for turn in range(1, 5):
		actor = user_a if turn % 2 == 1 else user_b
		response = await service.submit_story(actor, schemas.StorySubmitRequest(activity_id=summary.id, content=f"Line {turn}"))
		if turn < 4:
			assert response["status"] == "continuing"
		else:
			assert response["status"] == "completed"

	detail = await service.get_activity(user_a, summary.id)
	assert detail.state == "completed"
	story_meta = detail.meta.get("story", {})
	assert story_meta.get("next_turn") == 4


@pytest.mark.asyncio
async def test_trivia_scoring_records_totals():
	service = ActivitiesService()
	user_a = UserFactory("alice").to_user()
	user_b = UserFactory("bob").to_user()

	options = schemas.ActivityOptions(trivia=schemas.TriviaOptions(questions=1, per_question_s=8))
	summary = await service.create_activity(user_a, user_b.id, schemas.CreateActivityRequest(kind="trivia", options=options))
	await service.reseed_trivia(user_a, summary.id, questions=1)
	await service.start_activity(user_a, summary.id)

	detail = await service.get_activity(user_a, summary.id)
	round_info = detail.rounds[0]
	correct_idx = int(round_info.meta.get("correct_idx", -1))

	await service.submit_trivia(
		user_a,
		schemas.TriviaAnswerRequest(activity_id=summary.id, round_idx=1, choice_idx=correct_idx),
	)
	board = await service.submit_trivia(
		user_b,
		schemas.TriviaAnswerRequest(activity_id=summary.id, round_idx=1, choice_idx=(correct_idx + 1) % 4),
	)

	assert board.totals[user_a.id] > board.totals[user_b.id]
	assert 1 in board.per_round

	detail = await service.get_activity(user_a, summary.id)
	assert detail.state == "completed"


@pytest.mark.asyncio
async def test_rps_commit_and_reveal_cycle():
	service = ActivitiesService()
	user_a = UserFactory("alice").to_user()
	user_b = UserFactory("bob").to_user()

	options = schemas.ActivityOptions(rps=schemas.RpsOptions(best_of=1))
	summary = await service.create_activity(user_a, user_b.id, schemas.CreateActivityRequest(kind="rps", options=options))
	await service.start_activity(user_a, summary.id)

	nonce_a = "nonce-a"
	nonce_b = "nonce-b"
	choice_a = "rock"
	choice_b = "scissors"
	commit_a = hashlib.sha256(f"{choice_a}|{nonce_a}".encode()).hexdigest()
	commit_b = hashlib.sha256(f"{choice_b}|{nonce_b}".encode()).hexdigest()

	await service.rps_commit(user_a, schemas.RpsCommitRequest(activity_id=summary.id, round_idx=1, commit_hash=commit_a))
	await service.rps_commit(user_b, schemas.RpsCommitRequest(activity_id=summary.id, round_idx=1, commit_hash=commit_b))

	await service.rps_reveal(user_a, schemas.RpsRevealRequest(activity_id=summary.id, round_idx=1, choice=choice_a, commit_hash=commit_a, nonce=nonce_a))
	board = await service.rps_reveal(user_b, schemas.RpsRevealRequest(activity_id=summary.id, round_idx=1, choice=choice_b, commit_hash=commit_b, nonce=nonce_b))

	assert board.totals[user_a.id] == pytest.approx(1.0)
	assert board.totals[user_b.id] == pytest.approx(0.0)

	detail = await service.get_activity(user_a, summary.id)
	assert detail.state == "completed"


@pytest.mark.asyncio
async def test_trivia_reseed_updates_questions():
	service = ActivitiesService()
	user_a = UserFactory("alice").to_user()
	user_b = UserFactory("bob").to_user()

	summary = await service.create_activity(user_a, user_b.id, schemas.CreateActivityRequest(kind="trivia"))
	updated = await service.reseed_trivia(user_a, summary.id, questions=3)

	assert updated.meta.get("trivia")
	questions = updated.meta["trivia"].get("questions", [])
	assert len(questions) == 3
	assert all("prompt" in item for item in questions)