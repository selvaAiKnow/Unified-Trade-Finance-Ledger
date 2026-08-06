from app.config import settings
from app.kyc_intelligence.checker import KybDocumentChecker
from app.kyc_intelligence.claude_checker import ClaudeKybDocumentChecker
from app.kyc_intelligence.fake_checker import FakeKybDocumentChecker


def get_kyb_document_checker() -> KybDocumentChecker:
    if settings.anthropic_api_key:
        return ClaudeKybDocumentChecker(api_key=settings.anthropic_api_key)
    return FakeKybDocumentChecker()
