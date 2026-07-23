import re
from difflib import SequenceMatcher

FUZZY_THRESHOLD = 0.84


def normalize_name(name: str) -> str:
    upper = name.upper()
    stripped = re.sub(r"[^A-Z0-9\s]", "", upper)
    return re.sub(r"\s+", " ", stripped).strip()


def grade_match(query: str, candidate: str) -> str:
    normalized_query = normalize_name(query)
    normalized_candidate = normalize_name(candidate)

    if not normalized_query or not normalized_candidate:
        return "NONE"

    if normalized_query == normalized_candidate:
        return "EXACT"

    if normalized_query in normalized_candidate or normalized_candidate in normalized_query:
        return "FUZZY"

    ratio = SequenceMatcher(None, normalized_query, normalized_candidate).ratio()
    if ratio >= FUZZY_THRESHOLD:
        return "FUZZY"

    return "NONE"
