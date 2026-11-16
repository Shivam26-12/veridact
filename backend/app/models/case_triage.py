"""AI-assisted triage metadata for a case."""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class CaseTriage(Base):
    __tablename__ = "case_triage"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id = Column(
        String(36), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    triage_status = Column(String(20), nullable=False, default="pending")
    predicted_severity = Column(String(10), nullable=True)
    report_detail_score = Column(Integer, nullable=True)
    review_priority = Column(String(15), nullable=True)
    summary = Column(Text, nullable=True)
    model_name = Column(String(100), nullable=True)
    evaluated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    case = relationship("Case", back_populates="triage")
