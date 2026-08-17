# OpenBrain - one-shot setup + guided walkthrough (Windows PowerShell)
# Usage:  .\setup.ps1                     (interactive)
#         .\setup.ps1 -ApiKey fw_xxx      (non-interactive)

param([string]$ApiKey = "")

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "     ___   ____________  ________  ________" -ForegroundColor Cyan
Write-Host "    /   | / ____/ __ \ \/ /_  __/ / ____/ /" -ForegroundColor Cyan
Write-Host "   / /| |/ / __/ /_/ /\  / / /   / __/ / / " -ForegroundColor Cyan
Write-Host "  / ___ / /_/ / _, _/ / / / /___/ /___/ /___" -ForegroundColor Cyan
Write-Host " /_/  |_\____/_/ |_/_/ /_/_____/_____/_____/" -ForegroundColor Cyan
Write-Host ""
Write-Host "  build your own mind" -ForegroundColor White
Write-Host "  local-first AI agent platform" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  ------------------------------------------"
Write-Host ""

# --- Check Docker ---
Write-Host -NoNewline "  [1/5] Checking Docker...            "
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "X" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Docker is not installed." -ForegroundColor Red
    Write-Host "  Install from: https://www.docker.com/products/docker-desktop/" -ForegroundColor Cyan
    exit 1
}
Write-Host "OK" -ForegroundColor Green

# --- Check Docker Compose ---
Write-Host -NoNewline "  [2/5] Checking Docker Compose...     "
try { docker compose version | Out-Null } catch {
    Write-Host "X" -ForegroundColor Red
    Write-Host "  Update Docker Desktop to the latest version." -ForegroundColor Red
    exit 1
}
Write-Host "OK" -ForegroundColor Green

# --- Create .env ---
Write-Host -NoNewline "  [3/5] Preparing config...           "
if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host "OK" -ForegroundColor Green -NoNewline
    Write-Host "  (.env created)"
} else {
    Write-Host "OK" -ForegroundColor Green -NoNewline
    Write-Host "  (.env exists)"
}

# --- Get API key ---
if (-not $ApiKey) {
    Write-Host ""
    Write-Host "  Do you have a Fireworks API key?" -ForegroundColor White
    Write-Host "  Needed for: AI Architect, cloud LLM nodes" -ForegroundColor DarkGray
    Write-Host "  Get one free: https://fireworks.ai/" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Paste your key, or press Enter to skip (local mode works fine)." -ForegroundColor DarkGray
    Write-Host ""
    $ApiKey = Read-Host "  API key"
}

Write-Host -NoNewline "  [4/5] Saving API key...             "
if ($ApiKey) {
    $env_content = Get-Content .env -Raw
    $env_content = $env_content -replace "^FIREWORKS_API_KEY=.*", "FIREWORKS_API_KEY=$ApiKey"
    $env_content = $env_content -replace "^VITE_FIREWORKS_API_KEY=.*", "VITE_FIREWORKS_API_KEY=$ApiKey"
    if ($env_content -notmatch "FIREWORKS_API_KEY=") {
        $env_content += "`nFIREWORKS_API_KEY=$ApiKey`nVITE_FIREWORKS_API_KEY=$ApiKey"
    }
    Set-Content .env $env_content
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "SKIP" -ForegroundColor Yellow -NoNewline
    Write-Host "  (local mode)"
}

# --- Build and start ---
Write-Host ""
Write-Host -NoNewline "  [5/5] Building and starting stack...   "
docker compose up -d --build 2>&1 | Out-Null
Write-Host "OK" -ForegroundColor Green

# --- Pull Ollama model ---
Write-Host ""
Write-Host "  Pulling qwen2.5:7b model..." -ForegroundColor Cyan
Write-Host "  (first run downloads ~3GB, be patient)" -ForegroundColor DarkGray
Write-Host ""
docker exec openbrain-ollama ollama pull qwen2.5:7b 2>&1

Write-Host ""
Write-Host "  ------------------------------------------" -ForegroundColor Green
Write-Host ""
Write-Host "  Setup complete!" -ForegroundColor White
Write-Host ""

# =====================================================
#  GUIDED WALKTHROUGH
# =====================================================

Write-Host "  What would you like to do?" -ForegroundColor White
Write-Host ""
Write-Host "    [1]  Guide me - walk me through creating my first brain" -ForegroundColor Cyan
Write-Host "    [2]  I know what I am doing - just open the app" -ForegroundColor DarkGray
Write-Host ""
$choice = Read-Host "  Pick 1 or 2"

if ($choice -eq "1") {

    Write-Host ""
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host "  STEP 1 / 4 : CREATE A BRAIN" -ForegroundColor Cyan
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "  Opening OpenBrain in your browser..." -ForegroundColor White
    Start-Process "http://127.0.0.1:8080"
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
    Read-Host "  Press Enter when your brain is built and visible on the canvas"

    Write-Host ""
    Write-Host "  Nice! Your brain is created." -ForegroundColor Green
    Write-Host ""

    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host "  STEP 2 / 4 : TEST IT IN THE APP" -ForegroundColor Cyan
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Click the Activate Agent button to make your brain runnable." -ForegroundColor White
    Write-Host ""
    Write-Host "  Then type a question in the Agent panel to chat with it." -ForegroundColor DarkGray
    Write-Host '  For example: "Analyze Nike marketing and give me ideas"' -ForegroundColor DarkGray
    Write-Host ""
    Read-Host "  Press Enter when you have tested it"

    Write-Host ""
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host "  STEP 3 / 4 : TEST IT IN THE TERMINAL (TUI)" -ForegroundColor Cyan
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "  Building the terminal interface..." -ForegroundColor White
    Push-Location tui
    npm install 2>&1 | Out-Null
    npm run build 2>&1 | Out-Null
    Pop-Location
    Write-Host "  TUI built!" -ForegroundColor Green
    Write-Host ""

    Write-Host "  Now run this command in a NEW terminal window:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    cd $PWD" -ForegroundColor White
    Write-Host "    node tui\dist\cli.js create-a-market-research-agent-.brain" -ForegroundColor White
    Write-Host ""
    Write-Host "  Or run it one-shot (no interactive chat):" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host '    node tui\dist\cli.js create-a-market-research-agent-.brain --once "Analyze Nike marketing"' -ForegroundColor White
    Write-Host ""
    Read-Host "  Press Enter when you have tried the TUI"

    Write-Host ""
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host "  STEP 4 / 4 : EXPORT YOUR BRAIN" -ForegroundColor Cyan
    Write-Host "  ------------------------------------------" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Your brain is saved as a .brain file you can share:" -ForegroundColor White
    Write-Host ""
    Write-Host "    create-a-market-research-agent-.brain" -ForegroundColor White
    Write-Host ""
    Write-Host "  You can:" -ForegroundColor DarkGray
    Write-Host "    - Share it with anyone who has OpenBrain" -ForegroundColor DarkGray
    Write-Host "    - Run it on any machine: node tui\dist\cli.js <file>.brain" -ForegroundColor DarkGray
    Write-Host "    - Check it into git" -ForegroundColor DarkGray
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
