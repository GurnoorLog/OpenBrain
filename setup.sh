#!/usr/bin/env bash
# OpenBrain - one-shot setup + guided walkthrough
# Usage:  bash setup.sh   (interactive)

set -e

G='\033[0;32m'
C='\033[0;36m'
Y='\033[1;33m'
R='\033[0;31m'
W='\033[1;37m'
D='\033[2m'
N='\033[0m'

echo ""
echo -e "${C}"
echo "  ____                          ____  _  __"
echo " | __ )  __ _ _ __   __ _ _   _ | __ )| |/ /"
echo " |  _ \ / _\` | '_ \ / _\` | | | ||  _ \ ' / "
echo " | |_) | (_| | | | | (_| | |_| || |_) | . \ "
echo " |____/ \__,_|_| |_|\__,_|\__, ||____/|_|\_\\"
echo "                          |___/             "
echo ""
echo -e "${W}  build your own mind${N}"
echo -e "${D}  local-first AI agent platform${N}"
echo ""
echo -e "  ------------------------------------------"
echo ""

# --- Check Docker ---
echo -ne "  ${D}[1/4]${N} Checking Docker...            "
if ! command -v docker &> /dev/null; then
  echo -e "${R}X${N}"
  echo -e "  ${R}Docker is not installed.${N}"
  echo -e "  Install from: ${C}https://www.docker.com/products/docker-desktop/${N}"
  exit 1
fi
echo -e "${G}OK${N}"

# --- Check Docker Compose ---
echo -ne "  ${D}[2/4]${N} Checking Docker Compose...     "
if ! docker compose version &> /dev/null 2>&1; then
  echo -e "${R}X${N}"
  echo -e "  ${R}Update Docker Desktop to the latest version.${N}"
  exit 1
fi
echo -e "${G}OK${N}"

# --- Create .env ---
echo -ne "  ${D}[3/4]${N} Preparing config...           "
if [ ! -f .env ]; then
  cp .env.example .env
  echo -e "${G}OK${N}  (.env created)"
else
  echo -e "${G}OK${N}  (.env exists)"
fi

# =====================================================
#  CHOOSE YOUR LLM BACKEND
# =====================================================

echo ""
echo -e "  ------------------------------------------"
echo -e "  ${W}How do you want to run the AI?${N}"
echo -e "  ------------------------------------------"
echo ""
echo -e "    ${C}[1]${N}  Ollama (local, free, runs on your machine)"
echo -e "    ${C}[2]${N}  Fireworks API (cloud, needs API key)"
echo ""
read -rp "  Pick 1 or 2 > " LLM_CHOICE

if [ "$LLM_CHOICE" != "2" ]; then

  # --- Check HOST Ollama first ---
  echo ""
  echo -e "  ${W}Checking Ollama on your machine...${N}"

  HOST_OLLAMA_OK=false
  if curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
    HOST_OLLAMA_OK=true
  fi

  if [ "$HOST_OLLAMA_OK" = true ]; then
    echo -e "  ${G}Ollama is running on your machine!${N}"
    echo ""

    # Get model names
    MODELS=$(curl -s http://127.0.0.1:11434/api/tags | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"//' || true)

    if [ -n "$MODELS" ]; then
      echo -e "  ${W}Your installed models:${N}"
      echo ""
      IDX=1
      while IFS= read -r m; do
        echo -e "    ${C}[$IDX]${N}  $m"
        IDX=$((IDX + 1))
      done <<< "$MODELS"
      echo ""
      echo -e "    ${Y}[D]${N}  Download qwen2.5:7b (recommended, ~3GB)"
      echo ""
      read -rp "  Pick a model > " MODEL_PICK

      if [ "$MODEL_PICK" = "D" ] || [ "$MODEL_PICK" = "d" ]; then
        echo ""
        echo -e "  ${C}Downloading qwen2.5:7b (~3GB, be patient)...${N}"
        ollama pull qwen2.5:7b 2>&1
        SELECTED_MODEL="qwen2.5:7b"
      else
        SELECTED_MODEL=$(echo "$MODELS" | sed -n "${MODEL_PICK}p")
        if [ -z "$SELECTED_MODEL" ]; then
          SELECTED_MODEL=$(echo "$MODELS" | head -1)
        fi
      fi
    else
      echo -e "  ${Y}No models found. Downloading qwen2.5:7b (~3GB)...${N}"
      echo ""
      ollama pull qwen2.5:7b 2>&1
      SELECTED_MODEL="qwen2.5:7b"
    fi

    # Point container to host Ollama
    if grep -q "^OLLAMA_URL=" .env; then
      sed -i.bak "s|^OLLAMA_URL=.*|OLLAMA_URL=http://host.docker.internal:11434|" .env
    else
      echo "OLLAMA_URL=http://host.docker.internal:11434" >> .env
    fi
    if grep -q "^OLLAMA_MODEL=" .env; then
      sed -i.bak "s|^OLLAMA_MODEL=.*|OLLAMA_MODEL=$SELECTED_MODEL|" .env
    else
      echo "OLLAMA_MODEL=$SELECTED_MODEL" >> .env
    fi
    rm -f .env.bak

    echo ""
    echo -e "  ${G}Using model: $SELECTED_MODEL (from your machine)${N}"
    echo -e "  ${D}Ollama URL:  http://host.docker.internal:11434${N}"

  else
    # No host Ollama - use container
    echo -e "  ${Y}Ollama not found on your machine.${N}"
    echo -e "  ${W}Starting OpenBrain with built-in Ollama...${N}"
    echo ""

    echo -ne "  ${D}[4/4]${N} Starting OpenBrain stack...    "
    docker compose up -d --build 2>&1 | tail -1 | tr -d '\n'
    echo -e " ${G}OK${N}"

    echo ""
    echo -e "  ${D}Waiting for Ollama to start...${N}"
    for i in $(seq 1 30); do
      if curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    echo ""
    echo -e "  ${Y}Downloading qwen2.5:7b (~3GB, be patient)...${N}"
    docker exec openbrain-ollama ollama pull qwen2.5:7b 2>&1
    SELECTED_MODEL="qwen2.5:7b"

    if grep -q "^OLLAMA_MODEL=" .env; then
      sed -i.bak "s|^OLLAMA_MODEL=.*|OLLAMA_MODEL=$SELECTED_MODEL|" .env
    else
      echo "OLLAMA_MODEL=$SELECTED_MODEL" >> .env
    fi
    rm -f .env.bak

    echo ""
    echo -e "  ${G}Using model: $SELECTED_MODEL (inside Docker)${N}"
  fi

  if [ "$HOST_OLLAMA_OK" = false ]; then
    # Already started above
    :
  else
    # Start stack
    echo ""
    echo -ne "  ${D}[4/4]${N} Starting OpenBrain stack...    "
    docker compose up -d --build 2>&1 | tail -1 | tr -d '\n'
    echo -e " ${G}OK${N}"
  fi

else

  # --- Get API key ---
  echo ""
  echo -e "  ${W}You need a Fireworks API key.${N}"
  echo -e "  ${D}Get one free at: https://fireworks.ai/${N}"
  echo ""
  read -rp "  Paste your API key > " API_KEY

  if [ -z "$API_KEY" ]; then
    echo ""
    echo -e "  ${Y}No key provided. You can add it later to the .env file.${N}"
  else
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
    echo -e "  ${G}API key saved.${N}"
  fi

  echo ""
  echo -ne "  ${D}[4/4]${N} Starting OpenBrain stack...    "
  docker compose up -d --build 2>&1 | tail -1 | tr -d '\n'
  echo -e " ${G}OK${N}"

fi

echo ""
echo -e "  ${G}------------------------------------------${N}"
echo ""
echo -e "  ${G}  OpenBrain is ready!${N}"
echo -e "  ${C}  http://127.0.0.1:8080${N}"
echo ""

# =====================================================
#  GUIDED WALKTHROUGH
# =====================================================

echo -e "  ${W}What would you like to do?${N}"
echo ""
echo -e "    ${C}[1]${N}  Guide me - walk me through creating my first brain"
echo -e "    ${D}[2]${N}  I know what I am doing - just open the app"
echo ""
read -rp "  Pick 1 or 2 > " WALK_CHOICE

if [ "$WALK_CHOICE" = "1" ]; then

  echo ""
  echo -e "  ${C}------------------------------------------${N}"
  echo -e "  ${C}STEP 1 / 3 : CREATE A BRAIN${N}"
  echo -e "  ${C}------------------------------------------${N}"
  echo ""

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

  echo -e "  Now export it: click the Export button in the top-right corner."
  echo -e "  ${D}It saves a .brain file to your Downloads folder.${N}"
  echo ""
  read -rp "  Press Enter when you have exported the .brain file > " _

  echo ""
  echo -e "  ${C}------------------------------------------${N}"
  echo -e "  ${C}STEP 2 / 3 : RUN IT IN THE TERMINAL (TUI)${N}"
  echo -e "  ${C}------------------------------------------${N}"
  echo ""

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
  read -rp "  Press Enter when you have tried the TUI > " _

  echo ""
  echo -e "  ${C}------------------------------------------${N}"
  echo -e "  ${C}STEP 3 / 3 : WHAT YOU LEARNED${N}"
  echo -e "  ${C}------------------------------------------${N}"
  echo ""
  echo -e "  ${W}You now know how to:${N}"
  echo -e "    1. Create a brain with the AI Architect (browser)"
  echo -e "    2. Export it as a .brain file"
  echo -e "    3. Run any .brain file in the terminal with the TUI"
  echo ""
  echo -e "  ${D}Your .brain files are portable:${N}"
  echo -e "    ${D}- Share them with anyone who has OpenBrain${N}"
  echo -e "    ${D}- Run them on any machine: node tui/dist/cli.js <file>.brain${N}"
  echo -e "    ${D}- Check them into git${N}"
  echo ""

  echo -e "  ${G}------------------------------------------${N}"
  echo ""
  echo -e "  ${G}  You are all set!${N}"
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
