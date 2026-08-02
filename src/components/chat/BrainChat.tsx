import { useEffect, useRef, useState } from 'react'
import { useBrainStore } from '../../store/useBrainStore'
import { createFireworksAIProvider } from '../../core/providers/FireworksAIProvider'
import {
  buildPersona,
  buildStandaloneHtml,
  CHAT_CSS,
  readFireworksApiKey,
  type ChatMessage,
} from './chatCore'

export interface BrainChatProps {
  readonly open: boolean
  readonly onClose: () => void
}

export default function BrainChat({ open, onClose }: BrainChatProps) {
  const nodes = useBrainStore((state) => state.nodes)
  const projectName = useBrainStore((state) => state.projectName)
  const addLog = useBrainStore((state) => state.addLog)
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const persona = buildPersona(nodes, projectName)

  // Live canvas → chat: when the architect's llm node changes (a new design,
  // a rebuilt brain), the chat restarts with the new personality instantly.
  useEffect(() => {
    if (!open) return
    setMessages([])
    setError(null)
    setStreaming(false)
  }, [persona.nodeId, open])

  useEffect(() => {
    const body = bodyRef.current
    if (body) body.scrollTop = body.scrollHeight
  }, [messages, streaming])

  if (!open) return null

  const send = async () => {
    const text = input.trim()
    if (text === '' || streaming) return
    setInput('')
    setError(null)
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setStreaming(true)
    const assistant = { role: 'assistant' as const, content: '' }
    setMessages([...next, assistant])
    const controller = new AbortController()
    const provider = createFireworksAIProvider()
    try {
      const stream = provider.stream({
        messages: [
          { role: 'system', content: persona.systemPrompt },
          ...next.map((message) => ({ role: message.role, content: message.content })),
        ],
        model: persona.model,
        temperature: 0.6,
        maxTokens: 1024,
        signal: controller.signal,
      })
      for await (const chunk of stream) {
        assistant.content += chunk.delta
        setMessages([...next, { ...assistant }])
      }
    } catch (err) {
      if (controller.signal.aborted) return
      const detail = err instanceof Error ? err.message : String(err)
      setError(detail)
      setMessages([...next, { role: 'assistant', content: '⚠ ' + detail }])
    } finally {
      setStreaming(false)
    }
  }

  const openInNewTab = () => {
    const apiKey = readFireworksApiKey()
    const html = buildStandaloneHtml({
      title: projectName ?? 'OpenBrain app',
      systemPrompt: persona.systemPrompt,
      model: persona.model,
      apiKey,
      personaLabel: persona.label,
    })
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    addLog('Chat app opened in a new tab', 'success')
  }

  return (
    <div className="ob-chat">
      <style>{CHAT_CSS}</style>
      <div className="ob-chat-card">
        <div className="ob-chat-head">
          <div style={{ minWidth: 0 }}>
            <div className="ob-chat-title">{projectName ?? 'OpenBrain app'}</div>
            <div className="ob-chat-sub">Personality: {persona.label}</div>
          </div>
          <div className="ob-chat-spacer" />
          <button className="ob-chat-btn" onClick={openInNewTab} title="Open the same chat in its own tab">
            Open in new tab
          </button>
          <button className="ob-chat-btn" onClick={onClose} title="Close preview">
            ✕ Close
          </button>
        </div>
        <div className="ob-chat-body" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="ob-chat-empty">
              <b>Talk to the app you designed.</b>
              <br />
              This assistant was built from your OpenBrain graph{persona.nodeId ? ' — its LLM node’s instructions are live, edit the canvas and it updates here in real time' : ''}.
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index} className={`ob-chat-msg ${message.role}`}>
              {message.content}
              {message.role === 'assistant' && index === messages.length - 1 && streaming ? '▍' : ''}
            </div>
          ))}
          {streaming && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="ob-chat-typing">Thinking…</div>
          )}
          {error !== null && <div className="ob-chat-msg error">{error}</div>}
        </div>
        <div className="ob-chat-foot">
          <input
            className="ob-chat-input"
            placeholder="Message your assistant…"
            value={input}
            disabled={streaming}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send()
            }}
          />
          <button className="ob-chat-send" onClick={() => void send()} disabled={streaming}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
