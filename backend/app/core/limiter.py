"""Shared slowapi Limiter instance, kept separate from main.py to avoid circular imports
when routers want to apply @limiter.limit(...) to individual endpoints.

Disabled when ENV=test: the suite logs in dozens of times from one address and would otherwise
trip the per-IP login limit. (Limits are in-memory per process; for several instances configure
Redis storage -- see docs/deployment.md.)"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

limiter = Limiter(key_func=get_remote_address, enabled=get_settings().ENV != "test")
