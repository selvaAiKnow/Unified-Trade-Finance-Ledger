"""add partial unique index for platform admin singleton constraint

Revision ID: c3e9b1a4d2f6
Revises: b2f9a1c3d4e5
Create Date: 2026-08-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3e9b1a4d2f6'
down_revision: Union[str, None] = 'b2f9a1c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_users_single_platform_admin",
        "users",
        ["role"],
        unique=True,
        postgresql_where=sa.text("role = 'PLATFORM_ADMIN'"),
    )


def downgrade() -> None:
    op.drop_index("ix_users_single_platform_admin", table_name="users")
