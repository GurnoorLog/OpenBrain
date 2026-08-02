import type { BrainNode as LegacyBrainNode } from '../../core/types'
import { FIREWORKS_BASE_URL } from '../../core/architect/FireworksArchitect'
import { FIREWORKS_DEFAULT_MODEL_ID } from '../../core/providers/fireworksModels'
import { getSelectedFireworksModel } from '../canvas/architectAdapter'

export interface ChatMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export interface ChatPersona {
  readonly nodeId: string | null
  readonly label: string
  readonly systemPrompt: string
  readonly model: string
}

// The llm node the architect designed is the brain's "voice". Its stamped
// configuration.instructions become the chat's system prompt so the user talks
// to the exact assistant the AI designed — not a generic chatbot.
export function findLlmNode(nodes: readonly LegacyBrainNode[]): LegacyBrainNode | null {
  for (const node of nodes) {
    if (node.type === 'llm') return node
  }
  return null
}

function readInstructions(node: LegacyBrainNode | null): string {
  const value = node?.configuration?.['instructions']
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

export function chatModel(): string {
  return getSelectedFireworksModel() ?? FIREWORKS_DEFAULT_MODEL_ID
}

export function buildPersona(nodes: readonly LegacyBrainNode[], brainTitle: string | null): ChatPersona {
  const llm = findLlmNode(nodes)
  const instructions = readInstructions(llm)
  const fallback =
    brainTitle && brainTitle.trim() !== ''
      ? `You are "${brainTitle.trim()}" — the AI assistant designed inside OpenBrain. Reply in the same language the user wrote in; be concise and genuinely useful.`
      : 'You are an AI assistant designed inside OpenBrain. Reply in the same language the user wrote in; be concise and genuinely useful.'
  return {
    nodeId: llm?.id ?? null,
    label: instructions !== '' ? instructions.slice(0, 72) : 'Your OpenBrain assistant',
    systemPrompt: instructions !== '' ? instructions : fallback,
    model: (typeof llm?.model === 'string' && llm.model.trim() !== '') ? llm.model.trim() : chatModel(),
  }
}

export function readFireworksApiKey(): string | null {
  const env = (import.meta as { env?: Readonly<Record<string, string | undefined>> }).env
  const value = env?.VITE_FIREWORKS_API_KEY
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

// The chat is a small docked card in the bottom-right corner so the canvas —
// and the nodes running inside it — stay visible while you talk to the brain.
export const CHAT_CSS = `
.ob-chat * { box-sizing: border-box; }
.ob-chat {
  position: fixed; right: 20px; bottom: 84px; z-index: 80;
  width: min(400px, calc(100vw - 40px)); height: min(540px, calc(100vh - 140px));
  display: flex; flex-direction: column;
  background: linear-gradient(160deg, #14171f 0%, #0c0e13 100%);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 18px; overflow: hidden;
  box-shadow: 0 24px 80px rgba(0,0,0,0.6);
  font-family: inherit; font-size: 13.5px;
}
.ob-chat-head {
  display: flex; align-items: center; gap: 10px; padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.02); flex-shrink: 0;
}
.ob-chat-title { font-weight: 700; color: #fff; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ob-chat-sub { color: #7d8597; font-size: 10.5px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ob-chat-spacer { flex: 1; }
.ob-chat-btn {
  border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: #e6e9f0;
  border-radius: 9px; padding: 6px 10px; font-size: 11.5px; cursor: pointer; transition: all 0.15s;
  display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0;
}
.ob-chat-btn:hover { border-color: rgba(45, 212, 191, 0.5); color: #5eead4; background: rgba(45,212,191,0.08); }
.ob-chat-body { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; scroll-behavior: smooth; }
.ob-chat-msg { max-width: 85%; padding: 9px 12px; border-radius: 13px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.ob-chat-msg.user { align-self: flex-end; background: linear-gradient(135deg, #0d9488, #14b8a6); color: #04211d; border-bottom-right-radius: 4px; }
.ob-chat-msg.assistant { align-self: flex-start; background: rgba(255,255,255,0.06); color: #e6e9f0; border: 1px solid rgba(255,255,255,0.06); border-bottom-left-radius: 4px; }
.ob-chat-msg.error { align-self: center; background: rgba(244,63,94,0.12); border: 1px solid rgba(244,63,94,0.35); color: #fda4af; font-size: 12px; }
.ob-chat-empty { margin: auto; text-align: center; color: #5b6272; font-size: 12.5px; padding: 0 20px; }
.ob-chat-empty b { color: #8b93a5; }
.ob-chat-run-note {
  align-self: center; font-size: 11px; color: #7d8597; background: rgba(45,212,191,0.07);
  border: 1px solid rgba(45,212,191,0.2); border-radius: 999px; padding: 4px 10px;
  display: inline-flex; align-items: center; gap: 6px;
}
.ob-chat-run-note .dot { width: 7px; height: 7px; border-radius: 50%; background: #2dd4bf; animation: ob-pulse 1s infinite; }
@keyframes ob-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
.ob-chat-foot { display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.02); flex-shrink: 0; }
.ob-chat-input {
  flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #f1f3f8;
  border-radius: 11px; padding: 10px 13px; font-size: 13px; outline: none; transition: border-color 0.15s;
}
.ob-chat-input:focus { border-color: rgba(45, 212, 191, 0.5); }
.ob-chat-input::placeholder { color: #5b6272; }
.ob-chat-send {
  border: none; background: linear-gradient(135deg, #0d9488, #14b8a6); color: #04211d; font-weight: 700;
  border-radius: 11px; padding: 0 16px; font-size: 12.5px; cursor: pointer; transition: opacity 0.15s; flex-shrink: 0;
}
.ob-chat-send:hover { opacity: 0.88; }
.ob-chat-send:disabled { opacity: 0.4; cursor: not-allowed; }
.ob-chat-pill {
  position: fixed; right: 20px; bottom: 20px; z-index: 80;
  display: inline-flex; align-items: center; gap: 9px;
  background: linear-gradient(135deg, #0d9488, #14b8a6); color: #04211d; font-weight: 700; font-size: 13.5px;
  border: none; border-radius: 999px; padding: 12px 18px; cursor: pointer; box-shadow: 0 12px 40px rgba(13,148,136,0.4);
  transition: transform 0.15s, opacity 0.15s;
}
.ob-chat-pill:hover { transform: translateY(-2px); opacity: 0.92; }
`

// Escapes arbitrary text for safe embedding inside a <script> block in the
// standalone HTML document.
function jsString(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

// A self-contained chat app: the exact same UI as the docked preview, built as
// a static HTML document that talks straight to Fireworks. Opens in a new tab.
export function buildStandaloneHtml(options: {
  readonly title: string
  readonly systemPrompt: string
  readonly model: string
  readonly apiKey: string | null
  readonly personaLabel: string
}): string {
  const { title, systemPrompt, model, apiKey, personaLabel } = options
  const endpoint = `${FIREWORKS_BASE_URL}/chat/completions`
  const appTitle = jsString(title || 'OpenBrain app')
  const persona = jsString(personaLabel)
  const apiKeyExpr =
    apiKey !== null && apiKey !== ''
      ? `const API_KEY = ${jsString(apiKey)}`
      : 'const API_KEY = null'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${appTitle.replace(/"/g, '&quot;')}</title>
<style>
html, body { margin: 0; height: 100%; background: #0a0c10; color: #e6e9f0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
body { display: flex; align-items: center; justify-content: center; padding: 16px; }
.ob-chat { position: static; width: min(640px, 100%); height: min(720px, 94vh); }
</style>
<style>${CHAT_CSS}</style>
</head>
<body>
<div class="ob-chat">
  <div class="ob-chat-head">
    <div style="min-width:0">
      <div class="ob-chat-title">${appTitle.replace(/"/g, '&quot;')}</div>
      <div class="ob-chat-sub">${persona.replace(/"/g, '&quot;')}</div>
    </div>
  </div>
  <div id="msgs" class="ob-chat-body"></div>
  <div class="ob-chat-foot">
    <input id="input" class="ob-chat-input" placeholder="Message your assistant…" autocomplete="off" />
    <button id="send" class="ob-chat-send">Send</button>
  </div>
</div>
<script>
"use strict";
const SYSTEM = ${jsString(systemPrompt)};
const MODEL = ${jsString(model)};
const ENDPOINT = ${jsString(endpoint)};
${apiKeyExpr}
const msgs = document.getElementById('msgs');
const input = document.getElementById('input');
const send = document.getElementById('send');
const history = [];
function addMsg(role, content, isError) {
  const el = document.createElement('div');
  el.className = 'ob-chat-msg ' + (isError ? 'error' : role);
  el.textContent = content;
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  return el;
}
async function go() {
  const text = input.value.trim();
  if (!text || send.disabled) return;
  input.value = '';
  addMsg('user', text);
  const pending = addMsg('assistant', '…');
  send.disabled = true;
  history.push({ role: 'user', content: text });
  try {
    if (!API_KEY) throw new Error('Fireworks AI is not configured (missing API key).');
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYSTEM }, ...history], stream: true, max_tokens: 1024 }),
    });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = acc.indexOf('\\n')) !== -1) {
        const line = acc.slice(0, idx).trim(); acc = acc.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') { acc = ''; break; }
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content;
          if (typeof delta === 'string') pending.textContent += delta;
        } catch (e) { /* skip malformed chunk */ }
      }
    }
    if (pending.textContent === '…') pending.textContent = '';
    history.push({ role: 'assistant', content: pending.textContent });
  } catch (err) {
    pending.remove();
    addMsg('error', String((err && err.message) || err), true);
  } finally {
    send.disabled = false;
    input.focus();
  }
}
send.addEventListener('click', go);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
input.focus();
if (history.length === 0) {
  const empty = document.createElement('div');
  empty.className = 'ob-chat-empty';
  empty.innerHTML = '<b>Talk to the app you designed.</b><br/>This assistant was built from your OpenBrain graph.';
  msgs.appendChild(empty);
}
</script>
</body>
</html>`
}
