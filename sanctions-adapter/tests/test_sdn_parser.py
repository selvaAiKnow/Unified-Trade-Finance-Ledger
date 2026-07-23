from pathlib import Path

from app.sdn_parser import parse_sdn_xml

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sample_sdn.xml"


def test_parse_sdn_xml_extracts_primary_names_and_aliases():
    xml_bytes = FIXTURE_PATH.read_bytes()

    candidates = parse_sdn_xml(xml_bytes)
    names = {c.name for c in candidates}

    assert "John SMITHEXAMPLE" in names
    assert "Johnny SMITHALIAS" in names
    assert "ACME EXPORTS EXAMPLE LTD" in names
    assert len(candidates) == 3


def test_parse_sdn_xml_carries_sdn_type_and_programs():
    xml_bytes = FIXTURE_PATH.read_bytes()

    candidates = parse_sdn_xml(xml_bytes)
    by_name = {c.name: c for c in candidates}

    assert by_name["John SMITHEXAMPLE"].sdn_type == "Individual"
    assert by_name["John SMITHEXAMPLE"].programs == ["SDGT"]
    assert by_name["Johnny SMITHALIAS"].sdn_type == "Individual"
    assert by_name["Johnny SMITHALIAS"].programs == ["SDGT"]
    assert by_name["ACME EXPORTS EXAMPLE LTD"].sdn_type == "Entity"
    assert by_name["ACME EXPORTS EXAMPLE LTD"].programs == ["CUBA", "IRAN"]
