# OpenBrain — one-shot setup script (Windows PowerShell)
# Usage:  .\setup.ps1                     (interactive)
#         .\setup.ps1 -ApiKey fw_xxx      (non-interactive)

param([string]$ApiKey = "")

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗"
Write-Host "  ║       OpenBrain — Quick Setup         ║"
Write-Host "  ╚══════════════════════════════════════╝"
Write-Host ""

# ── Check Docker ──────────────────────────────────────────────────────────────
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "✗ Docker is not installed."
    Write-Host "  Install it from https://www.docker.com/products/docker-desktop/"
    exit 1
}
Write-Host "✓ Docker found"

# ── Check Docker Compose ──────────────────────────────────────────────────────
try { docker compose version | Out-Null } catch {
    Write-Host "✗ Docker Compose is not available."
    Write-Host "  Update Docker Desktop to the latest version."
    exit 1
}
Write-Host "✓ Docker Compose found"

# ── Create .env from .env.example ─────────────────────────────────────────────
if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host "✓ Created .env from .env.example"
}

# ── Get API key ───────────────────────────────────────────────────────────────
if (-not $ApiKey) {
    Write-Host ""
    Write-Host "Do you have a Fireworks API key? (needed for AI Architect + cloud LLM)"
    Write-Host "  Get one free at https://fireworks.ai/"
    Write-Host "  Paste it below, or press Enter to skip (local features still work)."
    Write-Host ""
    $ApiKey = Read-Host "  API key"
}

if ($ApiKey) {
    $env_content = Get-Content .env -Raw
    $env_content = $env_content -replace "^FIREWORKS_API_KEY=.*", "FIREWORKS_API_KEY=$ApiKey"
    $env_content = $env_content -replace "^VITE_FIREWORKS_API_KEY=.*", "VITE_FIREWORKS_API_KEY=$ApiKey"
    if ($env_content -notmatch "FIREWORKS_API_KEY=") {
        $env_content += "`nFIREWORKS_API_KEY=$ApiKey`nVITE_FIREWORKS_API_KEY=$ApiKey"
    }
    Set-Content .env $env_content
    Write-Host "✓ API key saved to .env"
} else {
    Write-Host "  → Skipping (local mode)"
}

# ── Build & start ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Building and starting OpenBrain..."
docker compose up -d --build 2>&1 | Select-Object -Last 1

# ── Pull Ollama model ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Waiting for Ollama to start..."
for ($i = 0; $i -lt 30; $i++) {
    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 2 -ErrorAction Stop | Out-Null
        break
    } catch { Start-Sleep -Seconds 1 }
}

Write-Host "Pulling qwen2.5:7b model (this takes a few minutes on first run)..."
docker exec openbrain-ollama ollama pull qwen2.5:7b 2>&1 | Select-Object -Last 3

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗"
Write-Host "  ║         OpenBrain is ready!          ║"
Write-Host "  ╚══════════════════════════════════════╝"
Write-Host ""
Write-Host "  Open http://127.0.0.1:8080 in your browser"
Write-Host ""
Write-Host "  To stop:   docker compose down"
Write-Host "  To start:  docker compose up -d"
Write-Host ""
