from app.kyc_intelligence.checker import KybDocumentCheckResult


class FakeKybDocumentChecker:
    async def check(self, content: bytes, org_name: str, media_type: str) -> KybDocumentCheckResult:
        return KybDocumentCheckResult(
            verified=True,
            summary="Fake checker: document accepted (stub result, no AI call made).",
        )
