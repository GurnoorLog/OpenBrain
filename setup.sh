#!/usr/bin/env bash
# OpenBrain — one-shot setup script
# Usage:  bash setup.sh           (interactive)
#         bash setup.sh --api-key fw_xxx   (non-interactive)

set -e

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║       OpenBrain — Quick Setup         ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# ── Check Docker ──────────────────────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  echo "✗ Docker is not installed."
  echo "  Install it from https://www.docker.com/products/docker-desktop/"
  exit 1
fi
echo "✓ Docker found"

# ── Check Docker Compose ──────────────────────────────────────────────────────
if ! docker compose version &> /dev/null 2>&1; then
  echo "✗ Docker Compose is not available."
  echo "  Update Docker Desktop to the latest version."
  exit 1
fi
echo "✓ Docker Compose found"

# ── Create .env from .env.example ─────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓ Created .env from .env.example"
fi

# ── Get API key ───────────────────────────────────────────────────────────────
API_KEY=""
for arg in "$@"; do
  case $arg in
    --api-key=*) API_KEY="${arg#*=}" ;;
    --api-key)   shift; API_KEY="$1"; shift ;;
  esac
done

if [ -z "$API_KEY" ]; then
  echo ""
  echo "Do you have a Fireworks API key? (needed for AI Architect + cloud LLM)"
  echo "  Get one free at https://fireworks.ai/"
  echo "  Paste it below, or press Enter to skip (local features still work)."
  echo ""
  read -rp "  API key: " API_KEY
fi

if [ -n "$API_KEY" ]; then
  # Write both VITE_ and non-VITE versions (SPA build + runtime env)
  if grep -q "^FIREWORKS_API_KEY=" .env; then
    sed -i.bak "s|^FIREWORKS_API_KEY=.*|FIREWORKS_API_KEY=$API_KEY|" .env
  else
    echo "FIREWORKS_API_KEY=$API_KEY" >> .env
  fi
  if grep -q "^VITE_FIREWORKS_API_KEY=" .env; then
    sed -i.bak "s|^VITE_FIREWORKS_API_KEY=.*|VITE_FIREWORKS_API_KEY=$API_KEY|" .env
  else
    echo "VITE_FIREWORKS_API_KEY=$API_KEY" >> .env
  fi
  rm -f .env.bak
  echo "✓ API key saved to .env"
else
  echo "  → Skipping (local mode)"
fi

# ── Build & start ─────────────────────────────────────────────────────────────
echo ""
echo "Building and starting OpenBrain..."
docker compose up -d --build 2>&1 | tail -1

# ── Pull Ollama model ─────────────────────────────────────────────────────────
echo ""
echo "Waiting for Ollama to start..."
for i in $(seq 1 30); do
  if curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Pulling qwen2.5:7b model (this takes a few minutes on first run)..."
docker exec openbrain-ollama ollama pull qwen2.5:7b 2>&1 | tail -3

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║         OpenBrain is ready!          ║"
echo "  ╚══════════════════════════════════════╝"
echo ""
echo "  Open http://127.0.0.1:8080 in your browser"
echo ""
echo "  To stop:   docker compose down"
echo "  To start:  docker compose up -d"
echo ""
