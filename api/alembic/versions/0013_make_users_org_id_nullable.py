"""make users.org_id nullable for platform admin accounts

Revision ID: b2f9a1c3d4e5
Revises: d7a4f6c2e8b1
Create Date: 2026-08-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b2f9a1c3d4e5'
down_revision: Union[str, None] = 'd7a4f6c2e8b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('users', 'org_id', nullable=True)


def downgrade() -> None:
    # Platform admin accounts (role='PLATFORM_ADMIN', org_id=NULL) are unrepresentable
    # in the pre-0013 schema where org_id is NOT NULL. Downgrading necessarily removes
    # them; otherwise the alter_column below would fail with a NOT NULL violation on
    # any existing platform admin row.
    op.execute("DELETE FROM users WHERE role = 'PLATFORM_ADMIN'")
    op.alter_column('users', 'org_id', nullable=False)
