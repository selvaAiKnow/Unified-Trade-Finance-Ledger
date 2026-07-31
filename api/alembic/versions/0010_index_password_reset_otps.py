"""index password_reset_otps.user_id and default attempt_count

Revision ID: b3a71c40d2f5
Revises: 9e11d6601079
Create Date: 2026-07-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3a71c40d2f5'
down_revision: Union[str, None] = '9e11d6601079'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Both forgot_password and verify_otp filter password_reset_otps by user_id.
    op.create_index('ix_password_reset_otps_user_id', 'password_reset_otps', ['user_id'])
    # attempt_count is NOT NULL but relied on the Python-side model default only.
    op.alter_column(
        'password_reset_otps',
        'attempt_count',
        existing_type=sa.Integer(),
        existing_nullable=False,
        server_default=sa.text('0'),
    )


def downgrade() -> None:
    op.alter_column(
        'password_reset_otps',
        'attempt_count',
        existing_type=sa.Integer(),
        existing_nullable=False,
        server_default=None,
    )
    op.drop_index('ix_password_reset_otps_user_id', table_name='password_reset_otps')
