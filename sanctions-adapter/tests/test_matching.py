from app.matching import grade_match, normalize_name


def test_normalize_name_uppercases_strips_punctuation_and_collapses_whitespace():
    assert normalize_name("  John   O'Smith-Jones Jr.  ") == "JOHN OSMITHJONES JR"


def test_grade_match_exact_after_normalization():
    assert grade_match("john smith", "JOHN   SMITH") == "EXACT"


def test_grade_match_fuzzy_substring():
    assert grade_match("John Smith", "John Smith Jr") == "FUZZY"


def test_grade_match_fuzzy_similar_spelling():
    assert grade_match("Jon Smyth", "John Smith") == "FUZZY"


def test_grade_match_none_for_unrelated_names():
    assert grade_match("Alice Johnson", "Robert Chen") == "NONE"


def test_grade_match_none_for_empty_input():
    assert grade_match("", "John Smith") == "NONE"
    assert grade_match("John Smith", "") == "NONE"
