"""
VERIDACT — Admin Routes
Handles admin user management and analytics.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.admin_schemas import AnalyticsResponse, UserListResponse, UpdateUserRequest
from app.schemas.auth_schemas import UserResponse
from app.services import admin_service
from app.utils.security import require_roles

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/users", response_model=UserListResponse)
async def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("super_admin")),
):
    """Return every user account. Password hashes are never included. super_admin only."""
    users, total = admin_service.list_users(db)
    return UserListResponse(items=users, total=total)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    body: UpdateUserRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("super_admin")),
):
    """Updates user role or active status. super_admin only."""
    user = admin_service.update_user(db, user_id, body.model_dump(exclude_unset=True))
    return UserResponse.model_validate(user)


@router.get("/analytics", response_model=AnalyticsResponse)
async def get_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("supervisor", "super_admin")),
):
    """Incident counts, severity and type breakdowns, and the five newest cases."""
    return admin_service.get_analytics(db)
