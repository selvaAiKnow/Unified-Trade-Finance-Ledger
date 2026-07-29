import numpy as np

from app.lookup_tables import COUNTRY_RISK_TIER
from app.training.generate_data import generate_synthetic_dataset


def test_generate_synthetic_dataset_shapes():
    X, y = generate_synthetic_dataset(n=100, seed=1)
    assert X.shape == (100, 6)
    assert y.shape == (100,)
    assert set(np.unique(y)).issubset({0, 1})


def test_labels_are_not_all_one_class():
    _, y = generate_synthetic_dataset(n=2000, seed=1)
    high_risk_rate = y.mean()
    assert 0.05 < high_risk_rate < 0.95


def test_worse_buyer_country_correlates_with_higher_risk_rate():
    """The generator's formula must actually drive the labels: a buyer in the
    worst-tier country should show a higher mean high-risk rate than a buyer
    in the best-tier country, despite the noise and the other randomized
    features -- this is what proves the synthetic ground truth is real
    signal, not just noise with a coin flip attached."""
    X, y = generate_synthetic_dataset(n=6000, seed=1)
    buyer_country_column = X[:, 1]

    worst_country = max(COUNTRY_RISK_TIER, key=lambda country: COUNTRY_RISK_TIER[country])
    best_country = min(COUNTRY_RISK_TIER, key=lambda country: COUNTRY_RISK_TIER[country])

    worst_rate = y[buyer_country_column == worst_country].mean()
    best_rate = y[buyer_country_column == best_country].mean()

    assert worst_rate > best_rate
