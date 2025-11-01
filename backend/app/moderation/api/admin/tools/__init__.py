"""Admin tools routers for Phase 6 scaffolding."""

from fastapi import APIRouter

from . import (
    actions_catalog,
    batch_revert,
    batch_unshadow,
    bundle_export,
    bundle_import,
    run_macro,
    simulate_macro,
)

router = APIRouter()
router.include_router(actions_catalog.router)
router.include_router(run_macro.router)
router.include_router(simulate_macro.router)
router.include_router(batch_revert.router)
router.include_router(batch_unshadow.router)
router.include_router(bundle_import.router)
router.include_router(bundle_export.router)

__all__ = ["router"]
