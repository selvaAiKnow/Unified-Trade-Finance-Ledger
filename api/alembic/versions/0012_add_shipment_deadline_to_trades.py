"""add shipment_deadline to trades

Revision ID: d7a4f6c2e8b1
Revises: c4f82e91a3b6
Create Date: 2026-07-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7a4f6c2e8b1'
down_revision: Union[str, None] = 'c4f82e91a3b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('trades', sa.Column('shipment_deadline', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('trades', 'shipment_deadline')
