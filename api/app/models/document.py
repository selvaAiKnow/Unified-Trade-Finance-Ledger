import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import DocumentVerificationStatus


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trade_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trades.id"), nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    document_type: Mapped[str] = mapped_column(String, nullable=False)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    submitted_to: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    off_chain_storage_ref: Mapped[str] = mapped_column(String, nullable=False)
    on_chain_hash: Mapped[str] = mapped_column(String, nullable=False)
    verification_status: Mapped[str] = mapped_column(String, nullable=False, default=DocumentVerificationStatus.PENDING.value)
    ai_summary: Mapped[str | None] = mapped_column(String, nullable=True)
    ai_discrepancies: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    ai_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def __init__(self, **kwargs):
        # SQLAlchemy's mapped_column(default=...) only applies at flush/INSERT time, not on Python object
        # construction. This override ensures a freshly-constructed Document immediately reflects its
        # verification_status default (PENDING), which is required for unit tests that check defaults
        # on unflushed objects (see test_document_model.py).
        if "verification_status" not in kwargs:
            kwargs["verification_status"] = DocumentVerificationStatus.PENDING.value
        super().__init__(**kwargs)
