from app.training.train_model import train


def test_trained_model_clears_the_auc_floor():
    """The one test that proves the model is genuinely learning the risk
    relationship from noisy features, not just loading without error --
    this project's equivalent of a live-network integration test for this
    service's actual core claim."""
    _, auc = train(n_samples=5000, seed=1)
    assert auc > 0.75
