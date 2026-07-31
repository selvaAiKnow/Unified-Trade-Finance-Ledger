import base64

import anthropic

from app.document_intelligence.checker import DocumentCheckResult


class ClaudeDocumentChecker:
    def __init__(self, api_key: str) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=api_key, timeout=90.0)

    async def check(
        self, content: bytes, trade_terms: dict[str, str], media_type: str
    ) -> DocumentCheckResult | None:
        encoded = base64.standard_b64encode(content).decode("utf-8")
        terms_text = "\n".join(f"- {key}: {value}" for key, value in trade_terms.items())
        response = await self._client.messages.parse(
            model="claude-opus-5",
            max_tokens=16000,
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
                                "This document was submitted as part of a trade finance transaction "
                                "with these recorded terms:\n"
                                f"{terms_text}\n\n"
                                "Does anything in the document contradict these terms? Consider "
                                "values, dates, descriptions, and party names. List any contradictions "
                                "as discrepancies; if there are none, return an empty list and mark "
                                "the document compliant."
                            ),
                        },
                    ],
                }
            ],
            output_format=DocumentCheckResult,
        )
        return response.parsed_output
