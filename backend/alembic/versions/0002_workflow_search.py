"""document workflow (status/type), comment quotes, search indexes

Revision ID: 0002_workflow_search
Revises: 0001_initial
Create Date: 2026-10-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_workflow_search"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STATUS_VALUES = ("draft", "in_review", "approved", "archived")
TYPE_VALUES = ("spec", "rfc", "meeting_notes", "sprint_plan")

document_status = postgresql.ENUM(*STATUS_VALUES, name="documentstatus", create_type=False)
document_type = postgresql.ENUM(*TYPE_VALUES, name="documenttype", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    postgresql.ENUM(*STATUS_VALUES, name="documentstatus").create(bind, checkfirst=True)
    postgresql.ENUM(*TYPE_VALUES, name="documenttype").create(bind, checkfirst=True)

    op.add_column("documents", sa.Column("status", document_status, nullable=False, server_default="draft"))
    op.add_column("documents", sa.Column("doc_type", document_type, nullable=False, server_default="spec"))
    op.create_index("ix_documents_status", "documents", ["status"])

    op.add_column("comments", sa.Column("quote", sa.Text(), nullable=True))

    # Trigram indexes make `ILIKE '%term%'` title/content search index-assisted.
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE INDEX IF NOT EXISTS ix_documents_title_trgm ON documents USING gin (title gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_documents_content_trgm ON documents USING gin (content gin_trgm_ops)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_documents_content_trgm")
    op.execute("DROP INDEX IF EXISTS ix_documents_title_trgm")
    op.drop_column("comments", "quote")
    op.drop_index("ix_documents_status", table_name="documents")
    op.drop_column("documents", "doc_type")
    op.drop_column("documents", "status")
    bind = op.get_bind()
    postgresql.ENUM(name="documenttype").drop(bind, checkfirst=True)
    postgresql.ENUM(name="documentstatus").drop(bind, checkfirst=True)
