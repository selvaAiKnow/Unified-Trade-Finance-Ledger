import sys
from pathlib import Path

import joblib
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from app.training.generate_data import generate_synthetic_dataset

# Column indices into the (n, 6) array generate_synthetic_dataset returns:
# 0=exporterCountry, 1=buyerCountry, 2=buyerIndustry, 3=buyerKybStatus (categorical),
# 4=orderValueLog (numeric), 5=paymentTerm (categorical).
CATEGORICAL_COLUMNS = [0, 1, 2, 3, 5]
NUMERIC_COLUMNS = [4]

AUC_FLOOR = 0.75


def build_pipeline() -> Pipeline:
    preprocessor = ColumnTransformer(
        [
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_COLUMNS),
            ("num", StandardScaler(), NUMERIC_COLUMNS),
        ]
    )
    return Pipeline(
        [
            ("preprocess", preprocessor),
            ("classify", LogisticRegression(max_iter=1000)),
        ]
    )


def train(n_samples: int = 20_000, seed: int = 42) -> tuple[Pipeline, float]:
    X, y = generate_synthetic_dataset(n_samples, seed=seed)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=seed, stratify=y
    )

    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)

    y_pred_proba = pipeline.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test, y_pred_proba)
    return pipeline, auc


def main() -> None:
    pipeline, auc = train()
    print(f"Validation AUC: {auc:.4f}")
    if auc < AUC_FLOOR:
        print(f"AUC below the {AUC_FLOOR} floor -- refusing to save a weak model.", file=sys.stderr)
        sys.exit(1)

    model_dir = Path("model")
    model_dir.mkdir(exist_ok=True)
    model_path = model_dir / "risk_model.joblib"
    joblib.dump(pipeline, model_path)
    print(f"Model saved to {model_path}")


if __name__ == "__main__":
    main()
