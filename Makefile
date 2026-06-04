up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

ps:
	docker compose ps

restart:
	docker compose down && docker compose up -d

test: install
	docker compose exec playwright npx playwright test

install:
	docker compose exec playwright npm install

report:
	docker compose exec playwright npx playwright show-report --host 0.0.0.0
