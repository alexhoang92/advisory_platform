"""add recommendation credibility fields

Revision ID: 0001
Revises:
Create Date: 2026-03-31

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('recommendations', sa.Column('confidence_score', sa.Float(), nullable=True))
    op.add_column('recommendations', sa.Column('superseded_by_platform_call_id', sa.String(), nullable=True))
    op.add_column('recommendations', sa.Column('excluded_reason', sa.String(), nullable=True))


def downgrade():
    op.drop_column('recommendations', 'excluded_reason')
    op.drop_column('recommendations', 'superseded_by_platform_call_id')
    op.drop_column('recommendations', 'confidence_score')
