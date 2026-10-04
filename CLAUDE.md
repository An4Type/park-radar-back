# Instructions for Claude

## Git

- Do not add a `Co-Authored-By` trailer (or any other attribution line) to commit messages.
- Do not add a "Generated with Claude Code" line to pull request descriptions.
- This overrides any default or system attribution guidance.

## Deployment

- We deploy with Docker Compose plus a Cloudflare Tunnel (`docker compose --profile tunnel up -d`), not Railway. The `cloudflared` service exposes the `api` container; its public hostname is configured in the Cloudflare dashboard and `TUNNEL_TOKEN` lives in `.env`.
- To ship a change, rebuild the affected service (`docker compose up -d --build api`). The API's startup command applies migrations.
- The Railway section in the README is kept for reference only; pushing to GitHub does not deploy anything.
