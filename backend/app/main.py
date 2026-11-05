import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api import auth, comments, documents, health, notifications, search, workspaces
from app.core.config import get_settings
from app.core.database import engine
from app.core.limiter import limiter
from app.core.logging import request_id_var, setup_logging
from app.core.redis_client import close_redis
from app.websocket import document_ws
from app.workers.activity_worker import recorder

settings = get_settings()
setup_logging(json_logs=settings.LOG_JSON or settings.is_production)
logger = logging.getLogger("converge")

DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await recorder.start()
    logger.info("Converge started (env=%s)", settings.ENV)
    try:
        yield
    finally:
        await recorder.stop()  # drain queued audit events before exiting
        await close_redis()
        await engine.dispose()
        logger.info("Converge stopped")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    debug=settings.DEBUG,
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    """Correlation id + access log + security headers for every HTTP request."""
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    token = request_id_var.set(request_id)
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("unhandled error on %s %s", request.method, request.url.path)
        response = JSONResponse(status_code=500, content={"detail": "Internal server error"})
    duration_ms = round((time.perf_counter() - started) * 1000, 1)

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    if not request.url.path.startswith(DOCS_PATHS):
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"

    if request.url.path != "/health":
        logger.info(
            "%s %s -> %s (%sms)", request.method, request.url.path, response.status_code, duration_ms,
            extra={"extra_fields": {
                "method": request.method, "path": request.url.path,
                "status": response.status_code, "duration_ms": duration_ms,
            }},
        )
    request_id_var.reset(token)
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    # One error shape everywhere so the frontend can rely on {detail: ...}.
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(documents.router)
app.include_router(comments.router)
app.include_router(notifications.router)
app.include_router(search.router)
app.include_router(document_ws.router)
