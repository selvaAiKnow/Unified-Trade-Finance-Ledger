from app.document_intelligence.checker import DocumentCheckResult


class FakeDocumentChecker:
    async def check(self, content: bytes, trade_terms: dict[str, str], media_type: str) -> DocumentCheckResult:
        return DocumentCheckResult(
            compliant=True,
            discrepancies=[],
            summary="Fake checker: no discrepancies (stub result, no AI call made).",
        )
