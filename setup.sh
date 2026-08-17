#!/usr/bin/env bash
# OpenBrain — one-shot setup + guided walkthrough
# Usage:  bash setup.sh           (interactive)
#         bash setup.sh --api-key fw_xxx   (non-interactive)

set -e

# Colors
G='\033[0;32m'   # green
B='\033[0;34m'   # blue
C='\033[0;36m'   # cyan
Y='\033[1;33m'   # yellow
R='\033[0;31m'   # red
W='\033[1;37m'   # white bold
D='\033[2m'      # dim
N='\033[0m'      # reset

echo ""
echo -e "${C}"
echo "     ___   ____________  ________  ________"
echo "    /   | / ____/ __ \ \/ /_  __/ / ____/ /"
echo "   / /| |/ / __/ /_/ /\  / / /   / __/ / / "
echo "  / ___ / /_/ / _, _/ / / / /___/ /___/ /___"
echo " /_/  |_\____/_/ |_/_/ /_/_____/_____/_____/"
echo ""
echo -e "${W}  build your own mind${N}"
echo -e "${D}  local-first AI agent platform${N}"
echo ""
echo -e "${N}  ─────────────────────────────────────────"
echo ""

# ── Check Docker ──────────────────────────────────────────────────────────────
echo -ne "  ${D}[1/5]${N} Checking Docker...            "
if ! command -v docker &> /dev/null; then
  echo -e "${R}X${N}"
  echo ""
  echo -e "  ${R}Docker is not installed.${N}"
  echo -e "  Install from: ${C}https://www.docker.com/products/docker-desktop/${N}"
  exit 1
fi
echo -e "${G}OK${N}"

# ── Check Docker Compose ──────────────────────────────────────────────────────
echo -ne "  ${D}[2/5]${N} Checking Docker Compose...     "
if ! docker compose version &> /dev/null 2>&1; then
  echo -e "${R}X${N}"
  echo -e "  ${R}Update Docker Desktop to the latest version.${N}"
  exit 1
fi
echo -e "${G}OK${N}"

# ── Create .env ───────────────────────────────────────────────────────────────
echo -ne "  ${D}[3/5]${N} Preparing config...           "
if [ ! -f .env ]; then
  cp .env.example .env
  echo -e "${G}OK${N}  (.env created)"
else
  echo -e "${G}OK${N}  (.env exists)"
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
  echo -e "  ${W}Do you have a Fireworks API key?${N}"
  echo -e "  ${D}Needed for: AI Architect, cloud LLM nodes${N}"
  echo -e "  ${D}Get one free: https://fireworks.ai/${N}"
  echo ""
  echo -e "  ${D}Paste your key, or press Enter to skip (local mode works fine).${N}"
  echo ""
  read -rp "  API key > " API_KEY
fi

echo -ne "  ${D}[4/5]${N} Saving API key...             "
if [ -n "$API_KEY" ]; then
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
  echo -e "${G}OK${N}"
else
  echo -e "${Y}SKIP${N}  (local mode)"
fi

# ── Build & start ─────────────────────────────────────────────────────────────
echo ""
echo -ne "  ${D}[5/5]${N} Building & starting stack...   "
docker compose up -d --build 2>&1 | tail -1 | tr -d '\n'
echo -e " ${G}OK${N}"

# ── Pull Ollama model ─────────────────────────────────────────────────────────
echo ""
echo -e "  ${C}Pulling qwen2.5:7b model...${N}"
echo -e "  ${D}(first run downloads ~3GB, be patient)${N}"
echo ""
docker exec openbrain-ollama ollama pull qwen2.5:7b 2>&1

echo ""
echo -e "  ${G}────────────────────────────────────────${N}"
echo ""
echo -e "  ${W}  Setup complete!${N}"
echo ""

# ═════════════════════════════════════════════════════════════════════════════
#  GUIDED WALKTHROUGH
# ═════════════════════════════════════════════════════════════════════════════

echo -e "  ${W}What would you like to do?${N}"
echo ""
echo -e "    ${C}[1]${N}  Guide me — walk me through creating my first brain"
echo -e "    ${D}[2]${N}  I know what I'm doing — just open the app"
echo ""
read -rp "  Pick 1 or 2 > " CHOICE

if [ "$CHOICE" = "1" ]; then

    echo ""
    echo -e "  ${C}────────────────────────────────────────${N}"
    echo -e "  ${C}STEP 1 / 4 : CREATE A BRAIN${N}"
    echo -e "  ${C}────────────────────────────────────────${N}"
    echo ""

    # Open browser
    echo -e "  ${W}Opening OpenBrain in your browser...${N}"
    if command -v open &> /dev/null; then
      open "http://127.0.0.1:8080"
    elif command -v xdg-open &> /dev/null; then
      xdg-open "http://127.0.0.1:8080"
    fi
    echo ""

    echo -e "  You should see a blank canvas and a chat box at the bottom."
    echo ""
    echo -e "  ${Y}Type this into the chat:${N}"
    echo ""
    echo -e "  ${W}> Create a market research agent that analyzes a company${N}"
    echo -e "  ${W}> and gives them 5 improvement ideas for their marketing.${N}"
    echo ""
    echo -e "  ${D}Press Enter and watch the AI Architect build your brain!${N}"
    echo ""
    read -rp "  Press Enter when your brain is built > " _

    echo ""
    echo -e "  ${G}Nice! Your brain is created.${N}"
    echo ""

    echo -e "  ${C}────────────────────────────────────────${N}"
    echo -e "  ${C}STEP 2 / 4 : TEST IT IN THE APP${N}"
    echo -e "  ${C}────────────────────────────────────────${N}"
    echo ""
    echo -e "  Click the ${Y}\"Activate Agent\"${N} button to make your brain runnable."
    echo ""
    echo -e "  ${D}Then type a question in the Agent panel to chat with it.${N}"
    echo -e "  ${D}For example: \"Analyze Nike's marketing and give me ideas\"${N}"
    echo ""
    read -rp "  Press Enter when you've tested it > " _

    echo ""
    echo -e "  ${C}────────────────────────────────────────${N}"
    echo -e "  ${C}STEP 3 / 4 : TEST IT IN THE TERMINAL (TUI)${N}"
    echo -e "  ${C}────────────────────────────────────────${N}"
    echo ""

    # Build TUI
    echo -e "  ${W}Building the terminal interface...${N}"
    (cd tui && npm install > /dev/null 2>&1 && npm run build > /dev/null 2>&1)
    echo -e "  ${G}TUI built!${N}"
    echo ""

    echo -e "  ${Y}Run this command in a NEW terminal window:${N}"
    echo ""
    echo -e "    ${W}cd $(pwd)${N}"
    echo -e "    ${W}node tui/dist/cli.js create-a-market-research-agent-.brain${N}"
    echo ""
    echo -e "  ${D}Or run it one-shot (no interactive chat):${N}"
    echo ""
    echo -e "    ${W}node tui/dist/cli.js create-a-market-research-agent-.brain --once \"Analyze Nike marketing\"${N}"
    echo ""
    read -rp "  Press Enter when you've tried the TUI > " _

    echo ""
    echo -e "  ${C}────────────────────────────────────────${N}"
    echo -e "  ${C}STEP 4 / 4 : EXPORT YOUR BRAIN${N}"
    echo -e "  ${C}────────────────────────────────────────${N}"
    echo ""
    echo -e "  ${W}Your brain is saved as a .brain file you can share:${N}"
    echo ""
    echo -e "    ${W}create-a-market-research-agent-.brain${N}"
    echo ""
    echo -e "  ${D}You can:${N}"
    echo -e "    ${D}- Share it with anyone who has OpenBrain${N}"
    echo -e "    ${D}- Run it on any machine: node tui/dist/cli.js <file>.brain${N}"
    echo -e "    ${D}- Check it into git${N}"
    echo ""

    echo -e "  ${G}────────────────────────────────────────${N}"
    echo ""
    echo -e "  ${G}  You're all set!${N}"
    echo ""
    echo -e "  ${W}  Quick reference:${N}"
    echo -e "    ${C}Create brains:  http://127.0.0.1:8080${N}"
    echo -e "    ${W}Run in TUI:     node tui/dist/cli.js <file>.brain${N}"
    echo -e "    ${W}Stop:           docker compose down${N}"
    echo -e "    ${W}Restart:        docker compose up -d${N}"
    echo ""

else

    echo ""
    echo -e "  ${W}Opening OpenBrain in your browser...${N}"
    if command -v open &> /dev/null; then
      open "http://127.0.0.1:8080"
    elif command -v xdg-open &> /dev/null; then
      xdg-open "http://127.0.0.1:8080"
    fi
    echo ""
    echo -e "  ${C}http://127.0.0.1:8080${N}"
    echo ""
    echo -e "  ${D}Quick reference:${N}"
    echo -e "    ${D}Create brains:  http://127.0.0.1:8080${N}"
    echo -e "    ${D}Run in TUI:     node tui/dist/cli.js <file>.brain${N}"
    echo -e "    ${D}Stop:           docker compose down${N}"
    echo -e "    ${D}Restart:        docker compose up -d${N}"
    echo ""

fi
