import xml.etree.ElementTree as ET
from dataclasses import dataclass


@dataclass
class CandidateName:
    name: str
    sdn_type: str
    programs: list[str]


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _local_findall(element: ET.Element, tag: str) -> list[ET.Element]:
    return [child for child in element if _strip_ns(child.tag) == tag]


def _local_find(element: ET.Element, tag: str) -> ET.Element | None:
    for child in element:
        if _strip_ns(child.tag) == tag:
            return child
    return None


def _text(element: ET.Element | None) -> str:
    return element.text.strip() if element is not None and element.text else ""


def parse_sdn_xml(xml_bytes: bytes) -> list[CandidateName]:
    root = ET.fromstring(xml_bytes)
    candidates: list[CandidateName] = []

    for entry in _local_findall(root, "sdnEntry"):
        sdn_type = _text(_local_find(entry, "sdnType")) or "Unknown"
        program_list = _local_find(entry, "programList")
        programs = (
            [_text(p) for p in _local_findall(program_list, "program")]
            if program_list is not None
            else []
        )

        first_name = _text(_local_find(entry, "firstName"))
        last_name = _text(_local_find(entry, "lastName"))
        primary_name = f"{first_name} {last_name}".strip()
        if primary_name:
            candidates.append(CandidateName(name=primary_name, sdn_type=sdn_type, programs=programs))

        aka_list = _local_find(entry, "akaList")
        if aka_list is not None:
            for aka in _local_findall(aka_list, "aka"):
                aka_first = _text(_local_find(aka, "firstName"))
                aka_last = _text(_local_find(aka, "lastName"))
                aka_name = f"{aka_first} {aka_last}".strip()
                if aka_name:
                    candidates.append(CandidateName(name=aka_name, sdn_type=sdn_type, programs=programs))

    return candidates
