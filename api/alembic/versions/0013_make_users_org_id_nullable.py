"""make users.org_id nullable for platform admin accounts

Revision ID: b2f9a1c3d4e5
Revises: d7a4f6c2e8b1
Create Date: 2026-08-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2f9a1c3d4e5'
down_revision: Union[str, None] = 'd7a4f6c2e8b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('users', 'org_id', nullable=True)


def downgrade() -> None:
    op.alter_column('users', 'org_id', nullable=False)
