import { useEffect, useRef, useState } from 'react'
import { useBrainStore } from '../../store/useBrainStore'
import { runBrain } from '../canvas/executionAdapter'
import { buildPersona, buildStandaloneHtml, CHAT_CSS, readFireworksApiKey, type ChatMessage } from './chatCore'

export interface BrainChatProps {
  readonly open: boolean
  readonly onClose: () => void
}

// A small docked chat card that TALKS TO THE REAL BRAIN: every message runs
// the graph (browser fetch → memory → llm → output) so you watch the nodes
// light up on the canvas as the assistant answers. Opened from the header.
export default function BrainChat({ open, onClose }: BrainChatProps) {
  const nodes = useBrainStore((state) => state.nodes)
  const projectName = useBrainStore((state) => state.projectName)
  const running = useBrainStore((state) => state.running)
  const addLog = useBrainStore((state) => state.addLog)
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const persona = buildPersona(nodes, projectName)
  const llmNodeId = persona.nodeId

  // Live canvas → chat: when the architect's llm node changes (a new design,
  // a rebuilt brain), the chat restarts with the new personality instantly.
  useEffect(() => {
    if (!open) return
    setMessages([])
    setError(null)
  }, [llmNodeId, open])

  useEffect(() => {
    const body = bodyRef.current
    if (body) body.scrollTop = body.scrollHeight
  }, [messages, running])

  const send = async () => {
    const text = input.trim()
    if (text === '' || running) return
    setInput('')
    setError(null)
    setMessages([...messages, { role: 'user', content: text }])
    try {
      const answer = await runBrain({ userMessage: text, downloadReport: false })
      setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          content:
            answer !== null && answer !== ''
              ? answer
              : 'The brain finished running but produced no text output — check the Agent log.',
        },
      ])
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setError(detail)
      setMessages((previous) => [...previous, { role: 'assistant', content: '⚠ ' + detail }])
    }
  }

  const openInNewTab = () => {
    const html = buildStandaloneHtml({
      title: projectName ?? 'OpenBrain app',
      systemPrompt: persona.systemPrompt,
      model: persona.model,
      apiKey: readFireworksApiKey(),
      personaLabel: persona.label,
    })
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    addLog('Chat app opened in a new tab', 'success')
  }

  if (!open) return null

  return (
    <>
      <style>{CHAT_CSS}</style>
      <div className="ob-chat">
        <div className="ob-chat-head">
          <div style={{ minWidth: 0 }}>
            <div className="ob-chat-title">{projectName ?? 'OpenBrain app'}</div>
            <div className="ob-chat-sub">
              {persona.label}
              {persona.model !== '' ? ` · ${persona.model.split('/').pop()}` : ''}
            </div>
          </div>
          <div className="ob-chat-spacer" />
          <button className="ob-chat-btn" onClick={openInNewTab} title="Open the same chat in its own tab">
            New tab
          </button>
          <button className="ob-chat-btn" onClick={onClose} title="Close chat">
            ✕
          </button>
        </div>
        <div className="ob-chat-body" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="ob-chat-empty">
              <b>Talk to the app you designed.</b>
              <br />
              Every message runs the real brain — browser, memory and LLM nodes
              light up on the canvas as it answers.
            </div>
          )}
          {running && (
            <div className="ob-chat-run-note">
              <span className="dot" />
              Running your brain — watch the nodes…
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index} className={`ob-chat-msg ${message.role}`}>
              {message.content}
            </div>
          ))}
          {error !== null && <div className="ob-chat-msg error">{error}</div>}
        </div>
        <div className="ob-chat-foot">
          <input
            className="ob-chat-input"
            placeholder={running ? 'Brain is running…' : 'Message your assistant…'}
            value={input}
            disabled={running}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send()
            }}
          />
          <button className="ob-chat-send" onClick={() => void send()} disabled={running}>
            Send
          </button>
        </div>
      </div>
    </>
  )
}
