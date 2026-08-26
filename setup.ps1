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

# --- Check Docker installed ---
Write-Host -NoNewline "  [1/5] Checking Docker installed...   "
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "X" -ForegroundColor Red
    Write-Host "  Docker is not installed." -ForegroundColor Red
    Write-Host "  Install from: https://www.docker.com/products/docker-desktop/" -ForegroundColor Cyan
    exit 1
}
Write-Host "OK" -ForegroundColor Green

# --- Check Docker daemon running ---
Write-Host -NoNewline "  [2/5] Checking Docker running...     "
$dockerRunning = $false
for ($attempt = 0; $attempt -lt 3; $attempt++) {
    try {
        $null = docker ps 2>&1
        if ($LASTEXITCODE -eq 0) {
            $dockerRunning = $true
            break
        }
    } catch {}
    if ($attempt -eq 0) {
        Write-Host ""
        Write-Host "  Docker Desktop is not running. Starting it..." -ForegroundColor Yellow
        Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue
    }
    Write-Host -NoNewline "  [2/5] Waiting for Docker daemon...   "
    Start-Sleep -Seconds 5
    Write-Host -NoNewline "`r  [2/5] Waiting for Docker daemon...   "
}
if (-not $dockerRunning) {
    Write-Host "X" -ForegroundColor Red
    Write-Host "  Docker Desktop could not start." -ForegroundColor Red
    Write-Host "  Open Docker Desktop manually and run this script again." -ForegroundColor Cyan
    exit 1
}
Write-Host "OK" -ForegroundColor Green

# --- Check Docker Compose ---
Write-Host -NoNewline "  [3/5] Checking Docker Compose...     "
try { docker compose version | Out-Null } catch {
    Write-Host "X" -ForegroundColor Red
    Write-Host "  Update Docker Desktop to the latest version." -ForegroundColor Red
    exit 1
}
Write-Host "OK" -ForegroundColor Green

# --- Create .env ---
Write-Host -NoNewline "  [4/5] Preparing config...            "
if (-not (Test-Path .env)) {
    if (Test-Path .env.example) {
        Copy-Item .env.example .env
        Write-Host "OK" -ForegroundColor Green -NoNewline
        Write-Host "  (.env created)"
    } else {
        Write-Host "X" -ForegroundColor Red
        Write-Host "  No .env.example found. Clone the repo first." -ForegroundColor Red
        exit 1
    }
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

    # --- Check Ollama installed ---
    Write-Host ""
    Write-Host -NoNewline "  [5/5] Checking Ollama installed...   "
    $ollamaInstalled = $false
    try {
        $null = Get-Command ollama -ErrorAction Stop
        $ollamaInstalled = $true
    } catch {}

    if (-not $ollamaInstalled) {
        Write-Host "X" -ForegroundColor Red
        Write-Host "  Ollama is not installed." -ForegroundColor Red
        Write-Host "  Install from: https://ollama.com/download" -ForegroundColor Cyan
        Write-Host "  Then run this script again." -ForegroundColor Cyan
        exit 1
    }
    Write-Host "OK" -ForegroundColor Green

    # --- Check Ollama running ---
    Write-Host -NoNewline "  Checking Ollama daemon...            "
    $hostOllamaOk = $false
    try {
        $hostModels = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 3 -ErrorAction Stop
        $hostOllamaOk = $true
    } catch {}

    if (-not $hostOllamaOk) {
        Write-Host "X" -ForegroundColor Yellow
        Write-Host "  Ollama is installed but not running. Starting it..." -ForegroundColor Yellow
        Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 5

        # Retry check
        try {
            $hostModels = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5 -ErrorAction Stop
            $hostOllamaOk = $true
        } catch {}
    }

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

        Write-Host -NoNewline "  Starting Docker stack...              "
        $ErrorActionPreference = "Continue"
        docker compose up -d 2>&1 | Out-Null
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
        Write-Host -NoNewline "  Starting Docker stack...              "
        $ErrorActionPreference = "Continue"
        docker compose up -d 2>&1 | Out-Null
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
    Write-Host -NoNewline "  Starting Docker stack...              "
    $ErrorActionPreference = "Continue"
    docker compose up -d 2>&1 | Out-Null
    $ErrorActionPreference = "Stop"
    Write-Host "OK" -ForegroundColor Green

}

Write-Host ""
Write-Host "  ------------------------------------------" -ForegroundColor Green
Write-Host ""

# --- Wait for server to be ready ---
Write-Host "  Waiting for server to start..." -ForegroundColor DarkGray
$serverReady = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $null = Invoke-WebRequest -Uri "http://127.0.0.1:8080" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        $serverReady = $true
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}

if ($serverReady) {
    Write-Host "  OpenBrain is ready!" -ForegroundColor Green
} else {
    Write-Host "  Server is still starting up. Give it 10-20 seconds." -ForegroundColor Yellow
}
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
    Write-Host "  STEP 1 / 4 : CREATE A BRAIN" -ForegroundColor Cyan
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "  Opening OpenBrain in your browser..." -ForegroundColor White
    if ($serverReady) {
        Start-Process "http://127.0.0.1:8080"
    } else {
        Write-Host "  Server not ready yet. Open http://127.0.0.1:8080 manually in a moment." -ForegroundColor Yellow
    }
    Write-Host ""

    Write-Host "  You should see a blank canvas and a chat box at the bottom." -ForegroundColor White
    Write-Host ""
    Write-Host "  Type this into the chat:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  > Create a market research agent that analyzes a company" -ForegroundColor White
    Write-Host "  > and gives them 5 improvement ideas for their marketing." -ForegroundColor White
    Write-Host ""
    Write-Host "  Press Enter and watch the AI Architect build your brain!" -ForegroundColor DarkGray
    Write-Host ""
    Read-Host "  Press Enter when your brain is built"

    Write-Host ""
    Write-Host "  Now click the Export button in the top-right corner." -ForegroundColor Yellow
    Write-Host "  It saves a .brain file to your Downloads folder." -ForegroundColor DarkGray
    Write-Host ""
    Read-Host "  Press Enter when you have exported the .brain file"

    Write-Host ""
    Write-Host "  Where did the .brain file save? (default: Downloads)" -ForegroundColor Yellow
    Write-Host "  Just type the filename, e.g. my-agent.brain" -ForegroundColor DarkGray
    $brainFile = Read-Host "  Filename"
    if (-not $brainFile) {
        $brainFile = (Get-ChildItem "$HOME\Downloads\*.brain" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
        if (-not $brainFile) {
            $brainFile = "my-agent.brain"
        }
    }

    Write-Host ""
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host "  STEP 2 / 4 : FINE-TUNE ON YOUR GPU" -ForegroundColor Cyan
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Back in the chat, type:" -ForegroundColor White
    Write-Host ""
    Write-Host "  > Fine-tune an LLM to summarize meeting notes" -ForegroundColor White
    Write-Host ""
    Write-Host "  Pick 'Train on this machine' when prompted." -ForegroundColor DarkGray
    Write-Host "  It runs on your GPU and saves the adapter." -ForegroundColor DarkGray
    Write-Host ""
    Read-Host "  Press Enter when fine-tuning is done"

    Write-Host ""
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host "  STEP 3 / 4 : RUN IN TERMINAL" -ForegroundColor Cyan
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Open a new terminal and run:" -ForegroundColor White
    Write-Host ""
    Write-Host "  cd tui && npm install && npm run build && cd .." -ForegroundColor Yellow
    Write-Host "  node tui/dist/cli.js $brainFile" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Your brain talks back to you in the terminal." -ForegroundColor DarkGray
    Write-Host ""
    Read-Host "  Press Enter when you've tried it"

    Write-Host ""
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host "  STEP 4 / 4 : EXPORT AND SHARE" -ForegroundColor Cyan
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Your .brain file IS the export." -ForegroundColor White
    Write-Host "  Email it, git commit it, put it on a USB stick." -ForegroundColor DarkGray
    Write-Host "  Anyone can run it with this same setup script." -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  ------------------------------------------" -ForegroundColor Magenta
    Write-Host ""

} else {

    Write-Host ""
    Write-Host "  Opening OpenBrain in your browser..." -ForegroundColor White
    if ($serverReady) {
        Start-Process "http://127.0.0.1:8080"
    } else {
        Write-Host "  Server not ready yet. Open http://127.0.0.1:8080 manually in a moment." -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "  http://127.0.0.1:8080" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Quick reference:" -ForegroundColor DarkGray
    Write-Host "    Create brains:  http://127.0.0.1:8080" -ForegroundColor DarkGray
    Write-Host "    Terminal:       node tui/dist/cli.js <file>.brain" -ForegroundColor DarkGray
    Write-Host "    API:            http://127.0.0.1:8080/run" -ForegroundColor DarkGray
    Write-Host ""

}
