"""Internal operations for inter-service communication."""
from __future__ import annotations
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel
from app.settings import settings
from app.domain.xp.models import XPAction
from app.domain.xp.service import XPService

router = APIRouter(prefix="/internal", tags=["internal"])

class XPAwardRequest(BaseModel):
	user_id: str
	action: XPAction
	metadata: Optional[dict] = None

def verify_internal_secret(x_internal_secret: str = Header(..., alias="X-Internal-Secret")):
	if x_internal_secret != settings.service_signing_key:
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid internal secret")

@router.post("/xp/award", status_code=status.HTTP_200_OK)
async def award_xp_internal(
	payload: XPAwardRequest,
	_auth: str = Depends(verify_internal_secret)
):
	try:
		user_uuid = UUID(payload.user_id)
	except ValueError:
		raise HTTPException(status_code=400, detail="Invalid UUID")

	service = XPService()
	try:
		stats = await service.award_xp(user_uuid, payload.action, metadata=payload.metadata)
		return {
			"total_xp": stats.total_xp,
			"current_level": stats.current_level
		}
	except Exception as e:
		raise HTTPException(status_code=500, detail=str(e))
