# OpenBrain - one-shot setup + guided walkthrough (Windows PowerShell)
# Usage:  .\setup.ps1                     (interactive)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host "            O P E N B R A I N" -ForegroundColor Cyan
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  build your own mind" -ForegroundColor White
Write-Host "  local-first AI agent platform" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  ------------------------------------------"
Write-Host ""

# --- Check Docker ---
Write-Host -NoNewline "  [1/4] Checking Docker...            "
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "X" -ForegroundColor Red
    Write-Host "  Docker is not installed." -ForegroundColor Red
    Write-Host "  Install from: https://www.docker.com/products/docker-desktop/" -ForegroundColor Cyan
    exit 1
}
Write-Host "OK" -ForegroundColor Green

# --- Check Docker Compose ---
Write-Host -NoNewline "  [2/4] Checking Docker Compose...     "
try { docker compose version | Out-Null } catch {
    Write-Host "X" -ForegroundColor Red
    Write-Host "  Update Docker Desktop to the latest version." -ForegroundColor Red
    exit 1
}
Write-Host "OK" -ForegroundColor Green

# --- Create .env ---
Write-Host -NoNewline "  [3/4] Preparing config...           "
if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host "OK" -ForegroundColor Green -NoNewline
    Write-Host "  (.env created)"
} else {
    Write-Host "OK" -ForegroundColor Green -NoNewline
    Write-Host "  (.env exists)"
}

# =====================================================
#  CHOOSE YOUR LLM BACKEND
# =====================================================

Write-Host ""
Write-Host "  ------------------------------------------"
Write-Host "  How do you want to run the AI?" -ForegroundColor White
Write-Host "  ------------------------------------------"
Write-Host ""
Write-Host "    [1]  Ollama (local, free, runs on your machine)" -ForegroundColor Cyan
Write-Host "    [2]  Fireworks API (cloud, needs API key)" -ForegroundColor Cyan
Write-Host ""
$llmChoice = Read-Host "  Pick 1 or 2"

$useOllama = ($llmChoice -ne "2")

if ($useOllama) {

    # --- Check HOST Ollama first ---
    Write-Host ""
    Write-Host "  Checking Ollama on your machine..." -ForegroundColor White

    $hostOllamaOk = $false
    try {
        $hostModels = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 3 -ErrorAction Stop
        $hostOllamaOk = $true
    } catch {}

    if ($hostOllamaOk) {
        Write-Host "  Ollama is running on your machine!" -ForegroundColor Green
        Write-Host ""

        # Get model names from host
        $modelList = @()
        if ($hostModels.models) {
            foreach ($m in $hostModels.models) {
                $modelList += $m.name
            }
        }

        if ($modelList.Count -gt 0) {
            Write-Host "  Your installed models:" -ForegroundColor White
            Write-Host ""
            for ($idx = 0; $idx -lt $modelList.Count; $idx++) {
                Write-Host "    [$($idx + 1)]  $($modelList[$idx])" -ForegroundColor White
            }
            Write-Host ""
            Write-Host "    [D]  Download qwen2.5:7b (recommended, ~3GB)" -ForegroundColor Yellow
            Write-Host ""
            $modelPick = Read-Host "  Pick a model"

            if ($modelPick -eq "D" -or $modelPick -eq "d") {
                Write-Host ""
                Write-Host "  Downloading qwen2.5:7b (~3GB, be patient)..." -ForegroundColor Cyan
                & ollama pull qwen2.5:7b 2>&1
                $selectedModel = "qwen2.5:7b"
            } else {
                $pickIdx = [int]$modelPick - 1
                if ($pickIdx -ge 0 -and $pickIdx -lt $modelList.Count) {
                    $selectedModel = $modelList[$pickIdx]
                } else {
                    $selectedModel = $modelList[0]
                }
            }
        } else {
            Write-Host "  No models found. Downloading qwen2.5:7b (~3GB)..." -ForegroundColor Yellow
            & ollama pull qwen2.5:7b 2>&1
            $selectedModel = "qwen2.5:7b"
        }

        # Point the container to the HOST Ollama
        $env_content = Get-Content .env -Raw
        $env_content = $env_content -replace "^OLLAMA_URL=.*", "OLLAMA_URL=http://host.docker.internal:11434"
        if ($env_content -notmatch "OLLAMA_URL=") {
            $env_content += "`nOLLAMA_URL=http://host.docker.internal:11434"
        }
        if ($env_content -match "OLLAMA_MODEL=") {
            $env_content = $env_content -replace "^OLLAMA_MODEL=.*", "OLLAMA_MODEL=$selectedModel"
        } else {
            $env_content += "`nOLLAMA_MODEL=$selectedModel"
        }
        Set-Content .env $env_content

        Write-Host ""
        Write-Host "  Using model: $selectedModel (from your machine)" -ForegroundColor Green
        Write-Host "  Ollama URL:  http://host.docker.internal:11434" -ForegroundColor DarkGray

    } else {
        # No host Ollama - use container Ollama
        Write-Host "  Ollama not found on your machine." -ForegroundColor Yellow
        Write-Host "  Starting OpenBrain with built-in Ollama..." -ForegroundColor White
        Write-Host ""

        Write-Host -NoNewline "  [4/4] Starting OpenBrain stack...    "
        $ErrorActionPreference = "Continue"
        docker compose up -d --build 2>&1 | Out-Null
        $ErrorActionPreference = "Stop"
        Write-Host "OK" -ForegroundColor Green

        Write-Host ""
        Write-Host "  Waiting for Ollama to start..." -ForegroundColor DarkGray
        for ($i = 0; $i -lt 30; $i++) {
            try {
                Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 2 -ErrorAction Stop | Out-Null
                break
            } catch { Start-Sleep -Seconds 1 }
        }

        Write-Host ""
        Write-Host "  Downloading qwen2.5:7b (~3GB, be patient)..." -ForegroundColor Yellow
        docker exec openbrain-ollama ollama pull qwen2.5:7b 2>&1
        $selectedModel = "qwen2.5:7b"

        $env_content = Get-Content .env -Raw
        if ($env_content -match "OLLAMA_MODEL=") {
            $env_content = $env_content -replace "^OLLAMA_MODEL=.*", "OLLAMA_MODEL=$selectedModel"
        } else {
            $env_content += "`nOLLAMA_MODEL=$selectedModel"
        }
        Set-Content .env $env_content

        Write-Host ""
        Write-Host "  Using model: $selectedModel (inside Docker)" -ForegroundColor Green
    }

    if (-not $hostOllamaOk) {
        # Already started above
    } else {
        # Start stack (Ollama is on host, no need to start container Ollama)
        Write-Host ""
        Write-Host -NoNewline "  [4/4] Starting OpenBrain stack...    "
        $ErrorActionPreference = "Continue"
        docker compose up -d --build 2>&1 | Out-Null
        $ErrorActionPreference = "Stop"
        Write-Host "OK" -ForegroundColor Green
    }

} else {

    # --- Get API key ---
    Write-Host ""
    Write-Host "  You need a Fireworks API key." -ForegroundColor White
    Write-Host "  Get one free at: https://fireworks.ai/" -ForegroundColor DarkGray
    Write-Host ""
    $apiKey = Read-Host "  Paste your API key"

    if (-not $apiKey) {
        Write-Host ""
        Write-Host "  No key provided. You can add it later to the .env file." -ForegroundColor Yellow
    } else {
        $env_content = Get-Content .env -Raw
        $env_content = $env_content -replace "^FIREWORKS_API_KEY=.*", "FIREWORKS_API_KEY=$apiKey"
        $env_content = $env_content -replace "^VITE_FIREWORKS_API_KEY=.*", "VITE_FIREWORKS_API_KEY=$apiKey"
        if ($env_content -notmatch "FIREWORKS_API_KEY=") {
            $env_content += "`nFIREWORKS_API_KEY=$apiKey`nVITE_FIREWORKS_API_KEY=$apiKey"
        }
        Set-Content .env $env_content
        Write-Host "  API key saved." -ForegroundColor Green
    }

    # --- Start stack ---
    Write-Host ""
    Write-Host -NoNewline "  [4/4] Starting OpenBrain stack...    "
    $ErrorActionPreference = "Continue"
    docker compose up -d --build 2>&1 | Out-Null
    $ErrorActionPreference = "Stop"
    Write-Host "OK" -ForegroundColor Green

}

Write-Host ""
Write-Host "  ------------------------------------------" -ForegroundColor Green
Write-Host ""
Write-Host "  OpenBrain is ready!" -ForegroundColor Green
Write-Host "  http://127.0.0.1:8080" -ForegroundColor Cyan
Write-Host ""

# =====================================================
#  GUIDED WALKTHROUGH
# =====================================================

Write-Host "  What would you like to do?" -ForegroundColor White
Write-Host ""
Write-Host "    [1]  Guide me - walk me through creating my first brain" -ForegroundColor Cyan
Write-Host "    [2]  I know what I am doing - just open the app" -ForegroundColor DarkGray
Write-Host ""
$walkChoice = Read-Host "  Pick 1 or 2"

if ($walkChoice -eq "1") {

    Write-Host ""
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host "  STEP 1 / 3 : CREATING DEMO BRAIN" -ForegroundColor Cyan
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "  Generating a demo brain for you..." -ForegroundColor White
    $demoBrain = @"
{
  "app": "OpenBrain",
  "version": 1,
  "name": "Market Research Agent",
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "graph": {
    "nodes": [
      {
        "id": "input-1",
        "type": "input",
        "x": 100,
        "y": 200,
        "content": "You are a market research analyst. Analyze the given company and provide 5 specific, actionable marketing improvement ideas."
      },
      {
        "id": "llm-1",
        "type": "llm",
        "x": 400,
        "y": 200,
        "content": "Analyze this company and give 5 marketing improvement ideas.",
        "model": "ollama"
      },
      {
        "id": "output-1",
        "type": "output",
        "x": 700,
        "y": 200,
        "content": "Format the ideas as a numbered list with a brief explanation for each."
      }
    ],
    "connections": [
      { "from": "input-1", "to": "llm-1" },
      { "from": "llm-1", "to": "output-1" }
    ]
  }
}
"@
    Set-Content -Path "demo.brain" -Value $demoBrain -Encoding UTF8
    Write-Host "  Created: demo.brain" -ForegroundColor Green
    Write-Host ""

    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host "  STEP 2 / 3 : RUN IT IN THE TERMINAL (TUI)" -ForegroundColor Cyan
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "  Building the terminal interface..." -ForegroundColor White
    Push-Location tui
    npm install 2>&1 | Out-Null
    npm run build 2>&1 | Out-Null
    Pop-Location
    Write-Host "  TUI built!" -ForegroundColor Green
    Write-Host ""

    Write-Host "  Run this command:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    node tui\dist\cli.js demo.brain --once `"Analyze Nike marketing`"" -ForegroundColor White
    Write-Host ""
    Read-Host "  Press Enter when you have tried it"

    Write-Host ""
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host "  STEP 3 / 3 : WHAT YOU LEARNED" -ForegroundColor Cyan
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  You now know how to:" -ForegroundColor White
    Write-Host "    1. Run any .brain file with: node tui\dist\cli.js <file>.brain" -ForegroundColor White
    Write-Host "    2. Create your own brains at: http://127.0.0.1:8080" -ForegroundColor White
    Write-Host "    3. Export them as .brain files to share" -ForegroundColor White
    Write-Host ""
    Write-Host "  ------------------------------------------" -ForegroundColor Green
    Write-Host ""
    Write-Host "  You are all set!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Quick reference:" -ForegroundColor White
    Write-Host "    Create brains:  http://127.0.0.1:8080" -ForegroundColor Cyan
    Write-Host "    Run in TUI:     node tui\dist\cli.js <file>.brain" -ForegroundColor White
    Write-Host "    Stop:           docker compose down" -ForegroundColor White
    Write-Host "    Restart:        docker compose up -d" -ForegroundColor White
    Write-Host ""

} else {

    Write-Host ""
    Write-Host "  Opening OpenBrain in your browser..." -ForegroundColor White
    Start-Process "http://127.0.0.1:8080"
    Write-Host ""
    Write-Host "  http://127.0.0.1:8080" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Quick reference:" -ForegroundColor DarkGray
    Write-Host "    Create brains:  http://127.0.0.1:8080" -ForegroundColor DarkGray
    Write-Host "    Run in TUI:     node tui\dist\cli.js <file>.brain" -ForegroundColor DarkGray
    Write-Host "    Stop:           docker compose down" -ForegroundColor DarkGray
    Write-Host "    Restart:        docker compose up -d" -ForegroundColor DarkGray
    Write-Host ""

}
