"""FastAPI routes for mini-activities."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from app.domain.activities import policy, schemas
from app.domain.activities.service import ActivitiesService
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/activities", tags=["activities"])

_service = ActivitiesService()


def _as_http_error(exc: Exception) -> HTTPException:
	if isinstance(exc, policy.ActivityPolicyError):
		return HTTPException(status_code=exc.status_code, detail=exc.detail)
	return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/with/{peer_id}", response_model=schemas.ActivitySummary, status_code=status.HTTP_201_CREATED)
async def create_activity_endpoint(
	peer_id: str,
	payload: schemas.CreateActivityRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ActivitySummary:
	try:
		return await _service.create_activity(auth_user, peer_id, payload)
	except Exception as exc:
		raise _as_http_error(exc) from exc


@router.post("/{activity_id}/start", response_model=schemas.ActivitySummary)
async def start_activity_endpoint(
	activity_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ActivitySummary:
	try:
		return await _service.start_activity(auth_user, activity_id)
	except Exception as exc:
		raise _as_http_error(exc) from exc


@router.post("/{activity_id}/cancel", response_model=schemas.ActivitySummary)
async def cancel_activity_endpoint(
	activity_id: str,
	payload: schemas.CancelActivityRequest | None = None,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ActivitySummary:
	try:
		reason = payload.reason if payload else "cancelled"
		return await _service.cancel_activity(auth_user, activity_id, reason=reason)
	except Exception as exc:
		raise _as_http_error(exc) from exc


@router.get("/{activity_id}", response_model=schemas.ActivityDetail)
async def get_activity_endpoint(
	activity_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ActivityDetail:
	try:
		return await _service.get_activity(auth_user, activity_id)
	except Exception as exc:
		raise _as_http_error(exc) from exc


@router.get("", response_model=List[schemas.ActivitySummary])
async def list_activities_endpoint(
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[schemas.ActivitySummary]:
	try:
		return await _service.list_my_activities(auth_user)
	except Exception as exc:
		raise _as_http_error(exc) from exc


@router.get("/{activity_id}/typing/prompt", response_model=schemas.TypingPromptResponse)
async def typing_prompt_endpoint(
	activity_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.TypingPromptResponse:
	try:
		return await _service.typing_prompt(auth_user, activity_id)
	except Exception as exc:
		raise _as_http_error(exc) from exc


@router.post("/typing/submissions", response_model=schemas.ActivityScorePayload)
async def submit_typing_endpoint(
	payload: schemas.TypingSubmitRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ActivityScorePayload:
	try:
		board = await _service.submit_typing(auth_user, payload)
		return schemas.ActivityScorePayload(**board.to_payload())
	except Exception as exc:
		raise _as_http_error(exc) from exc


@router.post("/story/submissions")
async def submit_story_endpoint(
	payload: schemas.StorySubmitRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	try:
		return await _service.submit_story(auth_user, payload)
	except Exception as exc:
		raise _as_http_error(exc) from exc


@router.post("/trivia/answers", response_model=schemas.ActivityScorePayload)
async def submit_trivia_endpoint(
	payload: schemas.TriviaAnswerRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ActivityScorePayload:
	try:
		board = await _service.submit_trivia(auth_user, payload)
		return schemas.ActivityScorePayload(**board.to_payload())
	except Exception as exc:
		raise _as_http_error(exc) from exc


@router.post("/rps/commit")
async def rps_commit_endpoint(
	payload: schemas.RpsCommitRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	try:
		return await _service.rps_commit(auth_user, payload)
	except Exception as exc:
		raise _as_http_error(exc) from exc


@router.post("/rps/reveal", response_model=schemas.ActivityScorePayload)
async def rps_reveal_endpoint(
	payload: schemas.RpsRevealRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ActivityScorePayload:
	try:
		board = await _service.rps_reveal(auth_user, payload)
		return schemas.ActivityScorePayload(**board.to_payload())
	except Exception as exc:
		raise _as_http_error(exc) from exc


@router.post("/{activity_id}/trivia/seed", response_model=schemas.ActivitySummary)
async def reseed_trivia_endpoint(
	activity_id: str,
	payload: schemas.TriviaSeedRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ActivitySummary:
	try:
		return await _service.reseed_trivia(auth_user, activity_id, questions=payload.questions)
	except Exception as exc:
		raise _as_http_error(exc) from exc
