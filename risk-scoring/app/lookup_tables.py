COUNTRY_RISK_TIER: dict[str, float] = {
    "US": 0.05,
    "GB": 0.05,
    "DE": 0.05,
    "JP": 0.05,
    "FR": 0.08,
    "SG": 0.08,
    "KR": 0.10,
    "AE": 0.15,
    "IN": 0.15,
    "CN": 0.20,
    "MX": 0.25,
    "BR": 0.25,
    "ZA": 0.25,
    "ID": 0.30,
    "VN": 0.30,
    "TR": 0.35,
    "EG": 0.40,
    "PK": 0.40,
    "NG": 0.45,
    "RU": 0.55,
}

INDUSTRY_RISK_TIER: dict[str, float] = {
    "electronics": 0.15,
    "pharmaceuticals": 0.15,
    "automotive": 0.20,
    "textiles": 0.25,
    "agriculture": 0.30,
    "chemicals": 0.35,
    "construction": 0.35,
    "commodities": 0.45,
    "oil_gas": 0.45,
    "mining": 0.50,
}

PAYMENT_TERM_RISK: dict[str, float] = {
    "SIGHT": 0.05,
    "USANCE_30": 0.15,
    "USANCE_60": 0.25,
    "USANCE_90": 0.35,
    "USANCE_180": 0.50,
}

KYB_STATUS_RISK: dict[str, float] = {
    "CLEAR": 0.05,
    "PENDING": 0.30,
    "REVIEW": 0.50,
    "BLOCK": 0.90,
}
