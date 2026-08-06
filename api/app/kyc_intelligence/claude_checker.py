import base64

import anthropic

from app.kyc_intelligence.checker import KybDocumentCheckResult


class ClaudeKybDocumentChecker:
    def __init__(self, api_key: str) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=api_key, timeout=90.0)

    async def check(self, content: bytes, org_name: str, media_type: str) -> KybDocumentCheckResult | None:
        encoded = base64.standard_b64encode(content).decode("utf-8")
        response = await self._client.messages.parse(
            model="claude-opus-5",
            max_tokens=4000,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": encoded,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "This document was submitted as a business registration certificate for "
                                f'the organization "{org_name}". Does it look like a genuine business '
                                "registration certificate, and does the organization name on the document "
                                f'reasonably match "{org_name}"? Set verified to true only if both hold; '
                                "otherwise false. Explain your reasoning in one or two sentences."
                            ),
                        },
                    ],
                }
            ],
            output_format=KybDocumentCheckResult,
        )
        return response.parsed_output
