"""Moderation API routers."""

from fastapi import APIRouter

from . import appeals, audit, cases, policies, reports, quarantine, hashes_admin, linkage, reputation, restrictions, self_restrictions
from .admin import admin_cases, admin_audit, admin_dashboard, admin_export, tools as admin_tools

router = APIRouter()
router.include_router(reports.router)
router.include_router(cases.router)
router.include_router(appeals.router)
router.include_router(policies.router)
router.include_router(audit.router)
router.include_router(admin_cases.router)
router.include_router(admin_audit.router)
router.include_router(admin_dashboard.router)
router.include_router(admin_export.router)
router.include_router(admin_tools.router)
router.include_router(quarantine.router)
router.include_router(hashes_admin.router)
router.include_router(reputation.router)
router.include_router(restrictions.router)
router.include_router(self_restrictions.router)
router.include_router(linkage.router)

__all__ = ["router"]
