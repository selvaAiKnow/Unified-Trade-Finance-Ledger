from app.config import settings
from app.document_intelligence.dependency import get_document_checker
from app.document_intelligence.fake_checker import FakeDocumentChecker


async def test_fake_document_checker_always_returns_compliant():
    checker = FakeDocumentChecker()
    result = await checker.check(b"fake pdf bytes", {"product_description": "Widgets"}, "application/pdf")
    assert result.compliant is True
    assert result.discrepancies == []
    assert isinstance(result.summary, str) and result.summary


def test_get_document_checker_returns_fake_when_no_api_key_configured(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", None)
    checker = get_document_checker()
    assert isinstance(checker, FakeDocumentChecker)


def test_get_document_checker_returns_claude_checker_when_api_key_configured(monkeypatch):
    from app.document_intelligence.claude_checker import ClaudeDocumentChecker

    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant-test-key")
    checker = get_document_checker()
    assert isinstance(checker, ClaudeDocumentChecker)
