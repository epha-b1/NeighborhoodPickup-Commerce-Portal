# NeighborhoodPickup Commerce Portal

## Docker-Only Run and Test

Run all commands from the repository root.

## Start the App

```bash
docker compose -f fullstack/docker-compose.yml -p neighborhoodpickup up --build -d
```

This starts:

- `db` (MySQL)
- `backend` (Express API on `http://localhost:4000`)
- `frontend` (Nginx on `http://localhost:8081`)

## Run Tests (Docker Only)

After the app is up:

```bash
docker compose -f fullstack/docker-compose.yml -p neighborhoodpickup run --rm tests
```

## Default Login Credentials

- member1 / Member#Pass123
- leader1 / Leader#Pass123
- reviewer1 / Reviewer#Pass123
- finance1 / Finance#Pass123
- admin1 / Admin#Pass12345

## Stop and Cleanup

```bash
docker compose -f fullstack/docker-compose.yml -p neighborhoodpickup down -v --remove-orphans
```
