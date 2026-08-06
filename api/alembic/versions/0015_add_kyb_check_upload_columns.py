"""add uploader, ai summary, and content type columns to kyb_checks

Revision ID: d1f6a9c2b3e8
Revises: c3e9b1a4d2f6
Create Date: 2026-08-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1f6a9c2b3e8'
down_revision: Union[str, None] = 'c3e9b1a4d2f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('kyb_checks', sa.Column('uploaded_by', sa.UUID(), nullable=True))
    op.add_column('kyb_checks', sa.Column('ai_summary', sa.String(), nullable=True))
    op.add_column('kyb_checks', sa.Column('document_content_type', sa.String(), nullable=True))
    op.create_foreign_key('kyb_checks_uploaded_by_fkey', 'kyb_checks', 'users', ['uploaded_by'], ['id'])


def downgrade() -> None:
    op.drop_constraint('kyb_checks_uploaded_by_fkey', 'kyb_checks', type_='foreignkey')
    op.drop_column('kyb_checks', 'document_content_type')
    op.drop_column('kyb_checks', 'ai_summary')
    op.drop_column('kyb_checks', 'uploaded_by')
