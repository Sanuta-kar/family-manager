# Docker Deployment

Copy `.env.example` to `.env` at the repository root and replace secrets before running:

```bash
docker compose -f infra/docker/docker-compose.yml up --build
```

The compose file expects the existing OpenClaw service to be reachable as `openclaw:8080`. Replace the `openclaw` service definition with the exact image/volume configuration from the Hostinger VPS if it differs.

