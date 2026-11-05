# Deploying Converge

The goal is a reliable, boring deployment — not infrastructure for its own sake. One host with
Docker Compose is enough to start; the same images run unchanged on managed services.

## Option A — single VM with Docker Compose (simplest)

1. Provision a small Linux VM (2 vCPU / 2–4 GB) and install Docker + the compose plugin.
2. `git clone` the repo to `/opt/converge`, then `cp .env.example .env` and set at least:
   * `ENV=production`
   * `JWT_SECRET_KEY` → `openssl rand -hex 32`
   * `POSTGRES_PASSWORD` → a long random value
   * `CORS_ORIGINS=https://your.domain` (only matters if you split API and web origins)
3. `docker compose -f docker-compose.prod.yml up -d --build`
4. Put TLS in front. Easiest: Caddy (`your.domain { reverse_proxy localhost:80 }`) or a cloud
   load balancer. Terminate TLS **there**; nginx inside the stack speaks plain HTTP.
5. Verify: `curl https://your.domain/health` → `{"status":"ok","database":"ok","redis":"ok"}`.

The backend container runs `alembic upgrade head` on start, so a single-instance deploy applies
migrations automatically.

To run several API instances, migrate **once**, then start replicas that skip it (avoids
concurrent migration runs):

```bash
docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade head
RUN_MIGRATIONS=false docker compose -f docker-compose.prod.yml up -d --scale backend=3
```

Redis keeps WebSockets consistent across instances; nginx resolves `backend` to all replicas.

Backups: `docker compose exec postgres pg_dump -U converge converge | gzip > backup.sql.gz`
on a schedule (cron), copied off-host. Redis holds nothing you need to back up.

## Option B — AWS building blocks

| Piece | Service | Notes |
|---|---|---|
| Frontend | S3 + CloudFront **or** the nginx container | If using S3, point `/api/*` and `/ws/*` behaviours at the ALB so the browser stays on one origin |
| API | ECS Fargate (or App Runner) running the backend image | ≥2 tasks; health check `/health`; idle timeout ≥ 1 h on the ALB for WebSockets |
| Database | RDS PostgreSQL 16 | enable `pg_trgm` (available by default) and automated backups |
| Redis | ElastiCache for Redis | private subnets; security group allows only the API tasks |
| Secrets | SSM Parameter Store / Secrets Manager | inject `JWT_SECRET_KEY`, `DATABASE_URL` as task env vars |
| Logs | CloudWatch | logs are already JSON in production, with a request id |

Do **not** add Kubernetes for this workload; ECS/Compose is sufficient.

## CI/CD

* `ci.yml` — on every PR/push: flake8, migration up/down/up, backend tests (real Postgres + Redis),
  frontend tests + type-check + build, Docker image builds.
* `deploy.yml` — on `main`: builds and pushes images to GHCR. If you set the repository variable
  `DEPLOY_HOST` and secrets `DEPLOY_USER` / `DEPLOY_SSH_KEY`, it also rolls the Compose stack
  forward over SSH.

## Pre-launch checklist

- [ ] `ENV=production` (hides API docs, enables HSTS, JSON logs)
- [ ] Strong `JWT_SECRET_KEY` and DB password, none committed to git
- [ ] TLS in front; WebSocket upgrade allowed; idle timeout ≥ 1 h
- [ ] Postgres backups tested with a restore
- [ ] `/health` wired to the load balancer / uptime monitor
- [ ] The API port is **not** published (only the proxy reaches it) — the image trusts `X-Forwarded-For` (`--forwarded-allow-ips=*`) so rate limits are per real client IP
- [ ] Rate-limit storage: the default limiter is per-process; with several instances put the
      limiter on Redis (`Limiter(storage_uri=REDIS_URL)`) for a global limit
