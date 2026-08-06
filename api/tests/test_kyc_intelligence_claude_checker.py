from app.kyc_intelligence.claude_checker import _build_prompt, _document_content_block


def test_document_content_block_uses_document_type_for_pdf():
    result = _document_content_block("application/pdf", "abc123")

    assert result["type"] == "document"
    assert result["source"]["media_type"] == "application/pdf"
    assert result["source"]["data"] == "abc123"


def test_document_content_block_uses_image_type_for_images():
    result = _document_content_block("image/jpeg", "abc123")

    assert result["type"] == "image"
    assert result["source"]["media_type"] == "image/jpeg"
    assert result["source"]["data"] == "abc123"


def test_build_prompt_delimits_the_organization_name():
    prompt = _build_prompt("Acme Exports Pvt. Ltd.")

    assert "<organization_name>" in prompt
    assert "</organization_name>" in prompt
    start = prompt.index("<organization_name>")
    end = prompt.index("</organization_name>")
    assert "Acme Exports Pvt. Ltd." in prompt[start:end]


def test_build_prompt_instructs_the_model_to_treat_the_name_as_data():
    org_name = "Acme Exports Pvt. Ltd."
    prompt = _build_prompt(org_name)

    instruction_index = prompt.lower().index("as data")
    name_value_index = prompt.index(org_name)
    assert instruction_index < name_value_index
    assert "never" in prompt.lower()
    assert "as instructions" in prompt.lower()
