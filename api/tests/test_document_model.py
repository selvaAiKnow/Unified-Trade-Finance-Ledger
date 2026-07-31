from app.models.document import Document
from app.models.enums import DocumentVerificationStatus


def test_document_defaults_to_pending_verification_status():
    document = Document(
        trade_id="00000000-0000-0000-0000-000000000001",
        category="Regulatory / Compliance",
        document_type="Certificate of Analysis (CoA)",
        uploaded_by="00000000-0000-0000-0000-000000000002",
        submitted_to="00000000-0000-0000-0000-000000000003",
        off_chain_storage_ref="ref",
        on_chain_hash="hash",
    )
    assert document.verification_status == DocumentVerificationStatus.PENDING.value


def test_document_ai_check_fields_default_to_none():
    document = Document(
        trade_id="00000000-0000-0000-0000-000000000001",
        category="Regulatory / Compliance",
        document_type="Certificate of Analysis (CoA)",
        uploaded_by="00000000-0000-0000-0000-000000000002",
        submitted_to="00000000-0000-0000-0000-000000000003",
        off_chain_storage_ref="ref",
        on_chain_hash="hash",
    )
    assert document.ai_summary is None
    assert document.ai_discrepancies is None
    assert document.ai_checked_at is None
