"""
VERIDACT — Admin Schemas
Request validation and response serialization for admin operations.
"""
from datetime import datetime
from typing import Optional, List, Dict

from pydantic import BaseModel, ConfigDict

from app.schemas.auth_schemas import UserResponse


class UpdateUserRequest(BaseModel):
    """Update user request — all fields optional."""
    role: Optional[str] = None
    is_active: Optional[bool] = None
    organization: Optional[str] = None


class UserListResponse(BaseModel):
    """Paginated user list response."""
    items: List[UserResponse]
    total: int


class RecentIncident(BaseModel):
    """Slim case row returned with the analytics summary."""
    id: str
    case_number: str
    title: str
    incident_type: str
    severity: str
    status: str
    assigned_to: Optional[str] = None
    response_status: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AnalyticsResponse(BaseModel):
    """Analytics dashboard response."""
    total_incidents: int
    open_cases: int
    resolved_cases: int
    critical_count: int
    incidents_by_severity: Dict[str, int]
    incidents_by_type: Dict[str, int]
    avg_resolution_hours: float
    recent_incidents: List[RecentIncident]
