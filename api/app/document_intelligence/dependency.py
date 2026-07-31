from app.config import settings
from app.document_intelligence.checker import DocumentChecker
from app.document_intelligence.claude_checker import ClaudeDocumentChecker
from app.document_intelligence.fake_checker import FakeDocumentChecker


def get_document_checker() -> DocumentChecker:
    if settings.anthropic_api_key:
        return ClaudeDocumentChecker(api_key=settings.anthropic_api_key)
    return FakeDocumentChecker()
