import numpy as np

from app.lookup_tables import COUNTRY_RISK_TIER, INDUSTRY_RISK_TIER, KYB_STATUS_RISK, PAYMENT_TERM_RISK

COUNTRIES = list(COUNTRY_RISK_TIER.keys())
INDUSTRIES = list(INDUSTRY_RISK_TIER.keys())
PAYMENT_TERMS = list(PAYMENT_TERM_RISK.keys())
KYB_STATUSES = list(KYB_STATUS_RISK.keys())

# Column order: exporterCountry, buyerCountry, buyerIndustry, buyerKybStatus,
# orderValueLog, paymentTerm -- matches app.model.FEATURE_ORDER exactly.
HIGH_RISK_THRESHOLD = 0.45


def generate_synthetic_dataset(n: int, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)

    rows = []
    labels = []
    for _ in range(n):
        exporter_country = rng.choice(COUNTRIES)
        buyer_country = rng.choice(COUNTRIES)
        buyer_industry = rng.choice(INDUSTRIES)
        buyer_kyb_status = rng.choice(KYB_STATUSES)
        payment_term = rng.choice(PAYMENT_TERMS)
        order_value = rng.lognormal(mean=11.5, sigma=1.2)
        order_value_log = float(np.log1p(order_value))

        latent_risk = (
            0.35 * COUNTRY_RISK_TIER[buyer_country]
            + 0.10 * COUNTRY_RISK_TIER[exporter_country]
            + 0.20 * INDUSTRY_RISK_TIER[buyer_industry]
            + 0.20 * KYB_STATUS_RISK[buyer_kyb_status]
            + 0.10 * PAYMENT_TERM_RISK[payment_term]
            + 0.05 * min(order_value / 2_000_000, 1.0)
        )
        noisy_risk = latent_risk + rng.normal(0, 0.12)
        high_risk = noisy_risk >= HIGH_RISK_THRESHOLD

        rows.append(
            [exporter_country, buyer_country, buyer_industry, buyer_kyb_status, order_value_log, payment_term]
        )
        labels.append(1 if high_risk else 0)

    X = np.array(rows, dtype=object)
    y = np.array(labels, dtype=int)
    return X, y
