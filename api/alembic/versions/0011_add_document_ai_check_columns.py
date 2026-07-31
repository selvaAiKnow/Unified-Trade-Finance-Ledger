"""add ai check columns to documents

Revision ID: c4f82e91a3b6
Revises: b3a71c40d2f5
Create Date: 2026-07-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4f82e91a3b6'
down_revision: Union[str, None] = 'b3a71c40d2f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('ai_summary', sa.String(), nullable=True))
    op.add_column('documents', sa.Column('ai_discrepancies', sa.JSON(), nullable=True))
    op.add_column('documents', sa.Column('ai_checked_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('documents', 'ai_checked_at')
    op.drop_column('documents', 'ai_discrepancies')
    op.drop_column('documents', 'ai_summary')
