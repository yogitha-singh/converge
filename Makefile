.PHONY: help up down logs build test test-backend test-frontend lint migrate seed prod-up prod-down psql

help:            ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up:              ## Start the dev stack (backend, frontend, postgres, redis)
	docker compose up --build

down:            ## Stop the dev stack
	docker compose down

logs:            ## Tail backend logs
	docker compose logs -f backend

migrate:         ## Apply database migrations inside the running backend
	docker compose exec backend alembic upgrade head

seed:            ## Load demo users, documents and comments (stack must be running)
	python3 scripts/seed_demo.py

psql:            ## Open a psql shell
	docker compose exec postgres psql -U converge converge

test: test-backend test-frontend   ## Run every test suite

test-backend:    ## Backend tests (needs Postgres + Redis from `docker compose up -d postgres redis`)
	docker compose up -d postgres redis
	docker compose exec -T postgres psql -U converge -tc "SELECT 1 FROM pg_database WHERE datname='converge_test'" | grep -q 1 || \
		docker compose exec -T postgres psql -U converge -c "CREATE DATABASE converge_test"
	cd backend && DATABASE_URL=postgresql+asyncpg://converge:converge@localhost:5432/converge_test \
		REDIS_URL=redis://localhost:6379/1 JWT_SECRET_KEY=test-secret python -m pytest -v

test-frontend:   ## Frontend unit/component tests
	cd frontend && npm test

lint:            ## Lint backend + frontend
	cd backend && python -m flake8 app --max-line-length=120 --select=E9,F
	cd frontend && npm run lint

prod-up:         ## Build and start the production-shaped stack
	docker compose -f docker-compose.prod.yml up -d --build

prod-down:       ## Stop the production-shaped stack
	docker compose -f docker-compose.prod.yml down
