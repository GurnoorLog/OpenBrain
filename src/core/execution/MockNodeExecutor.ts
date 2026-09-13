import type { AIProvider, NodeType } from '../domain'
import { NODE_CATALOG } from '../architect'
import type { NodeExecutor, NodeInputs, NodeOutputs } from './NodeExecutor'
import type { ExecutionContext } from './ExecutionContext'
import { getBrainMemoryStore } from '../memory/brainMemory'
import type { BrainMemoryStore } from '../memory/brainMemory'
import { buildRunReport, downloadReport } from '../report/buildRunReport'
import { getFallbackCatalog, runLocalInference } from '../localModel'

export interface MockNodeExecutorOptions {
  readonly provider?: AIProvider
  readonly memoryStore?: BrainMemoryStore
}

export interface MockExecutorsOptions {
  readonly provider?: AIProvider
  readonly memoryStore?: BrainMemoryStore
}

// Chat-driven runs reuse the whole graph but skip the automatic report
// download — the answer is returned to the chat pill instead.
let reportDownloadEnabled = true
export function setReportDownloadEnabled(enabled: boolean): void {
  reportDownloadEnabled = enabled
}

const rand = (max: number): number => Math.floor(Math.random() * max)

function runtimeBaseUrl(): string {
  const env = import.meta.env
  return env.VITE_RUNTIME_URL || env.VITE_CLOUD_EXECUTOR_URL || 'http://127.0.0.1:8080'
}

async function runtimePost(
  pathname: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
  const url = `${runtimeBaseUrl()}${pathname}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  return response.json().catch(() => ({ ok: false, error: `Invalid response from ${url}` }))
}

// Compact one-line preview used for logs/output summaries (truncates long text).
function firstValue(inputs: NodeInputs): string {
  const value = Object.values(inputs).find(
    (item) => typeof item === 'string' || typeof item === 'number',
  )
  if (value === undefined) return ''
  const text = String(value)
  return text.length > 48 ? `${text.slice(0, 48)}…` : text
}

// Reduces any input value to clean text: page objects expose their "content"
// field instead of being JSON-dumped, and nested lists flatten to lines.
function flattenPart(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((item) => flattenPart(item))
      .filter((line) => line.trim() !== '')
      .join('\n')
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    if (typeof record['content'] === 'string') return record['content']
    if (typeof record['text'] === 'string') return record['text']
    return Object.entries(record)
      .map(([key, v]) => `${key}: ${flattenPart(v)}`)
      .join('\n')
  }
  return String(value)
}

// Full-fidelity context for the LLM: every input value flattened to text, with
// the longest, most content-rich part FIRST so the model anchors on the real
// data (e.g. a fetched article) instead of short scaffold/memory boilerplate.
function llmContext(inputs: NodeInputs): string {
  const parts = Object.values(inputs)
    .map((value) => flattenPart(value))
    .filter((part) => part.trim() !== '')
  return parts.sort((a, b) => b.length - a.length).join('\n\n')
}

// The LLM also ingests the outputs of every other completed node that is NOT
// already feeding it through an edge (labelled by node id). This guarantees
// tool data reaches the analyst even when the architect wires a tool into
// memory/output instead of directly into the llm node.
function graphContext(context: ExecutionContext): string {
  const llmNodeId = context.currentNodeId
  const fedById = new Set(
    context.brain.edges
      .filter((edge) => edge.target === llmNodeId)
      .map((edge) => edge.source),
  )
  const parts: string[] = []
  for (const entry of context.brain.nodes) {
    if (entry.id === llmNodeId || fedById.has(entry.id)) continue
    const outputs = context.getNodeOutputs(entry.id)
    if (!outputs) continue
    const text = Object.entries(outputs)
      .map(([key, value]) => {
        const flat = flattenPart(value)
        return flat.trim() !== '' ? `${key}: ${flat}` : ''
      })
      .filter((line) => line.trim() !== '')
      .join('\n')
    if (text.trim() !== '') parts.push(`[${entry.id}]\n${text}`)
  }
  return parts.join('\n\n')
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const onAbort = (): void => {
      if (timeout !== undefined) clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
      reject(new DOMException('The execution was aborted.', 'AbortError'))
    }
    if (signal?.aborted) {
      reject(new DOMException('The execution was aborted.', 'AbortError'))
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
  })
}

function splitGoalClauses(goal: string): string[] {
  const cleaned = goal.replace(/\r/g, '').trim()
  if (cleaned === '') return []
  return cleaned
    .split(/\n|(?<=[.!?;])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
}

const GATE_OPERATORS: readonly { symbol: string; kind: string }[] = [
  { symbol: '>=', kind: 'cmp' },
  { symbol: '<=', kind: 'cmp' },
  { symbol: '!==', kind: 'cmp' },
  { symbol: '===', kind: 'cmp' },
  { symbol: '!=', kind: 'cmp' },
  { symbol: '==', kind: 'cmp' },
  { symbol: '>', kind: 'cmp' },
  { symbol: '<', kind: 'cmp' },
  { symbol: ' contains ', kind: 'contains' },
  { symbol: 'startsWith(', kind: 'startsWith' },
  { symbol: 'endsWith(', kind: 'endsWith' },
]

function evaluateGateCondition(
  expression: string,
  value: string,
): { passed: boolean; reason: string } {
  const raw = expression.trim()
  if (raw === '' && value === '') {
    return { passed: true, reason: 'gate opened (empty gate)' }
  }
  if (raw !== '') {
    for (const { symbol, kind } of GATE_OPERATORS) {
      const idx = raw.indexOf(symbol)
      if (idx === -1) continue
      const lhs = raw.slice(0, idx).trim()
      let rhs = raw.slice(idx + symbol.length).trim()
      if (kind === 'startsWith' || kind === 'endsWith') rhs = rhs.replace(/\)$/g, '')
      const kindMap: Record<string, string> = {
        cmp: 'cmp',
        contains: 'contains',
        startsWith: 'startsWith',
        endsWith: 'endsWith',
      }
      if (lhs !== '' && value === '') {
        return { passed: false, reason: `gate missing "${lhs}" value for comparison` }
      }
      const val = value
      const numVal = Number(val)
      const numRhs = Number(rhs)
      let matched = false
      switch (kindMap[kind]) {
        case 'cmp':
          matched = Object.is(val, rhs)
          break
        case 'contains':
          matched = val.includes(rhs)
          break
        case 'startsWith':
          matched = val.startsWith(rhs)
          break
        case 'endsWith':
          matched = val.endsWith(rhs)
          break
      }
      if (matched) {
        if (!Number.isNaN(numVal) && !Number.isNaN(numRhs)) {
          switch (symbol) {
            case '>':
              matched = numVal > numRhs
              break
            case '<':
              matched = numVal < numRhs
              break
            case '>=':
              matched = numVal >= numRhs
              break
            case '<=':
              matched = numVal <= numRhs
              break
          }
        }
      }
      return matched
        ? { passed: true, reason: `expression "${expression}" evaluated to true` }
        : { passed: false, reason: `expression "${expression}" evaluated to false` }
    }
  }
  if (raw === 'true') return { passed: true, reason: 'condition is literal true' }
  if (raw === 'false') return { passed: false, reason: 'condition is literal false' }
  return raw !== ''
    ? { passed: false, reason: `no recognized comparison operator found in "${expression}"` }
    : { passed: value !== '', reason: value !== '' ? 'gate passed (value present)' : 'gate blocked (no value provided)' }
}

// Default executor for every node type. Node types that need host-side work
// (filesystem, python, rag) route through the runtime's REST endpoints, which
// run on the machine where the workspace and knowledge live. Planner decomposes
// goals locally; gate evaluates locally. Tool nodes (browser/github/mcp/image-
// gen/news) are overridden at registration time by ToolNodeExecutor, which
// calls the real tool backends.
export class MockNodeExecutor implements NodeExecutor {
  constructor(
    private readonly type: NodeType,
    private readonly options?: MockNodeExecutorOptions,
  ) {}

  async execute(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    switch (this.type) {
      case 'llm':
        return this.llm(inputs, context)
      case 'local':
        return this.local(inputs, context)
      case 'memory':
        return this.memory(inputs, context)
      case 'planner':
        return this.planner(inputs, context)
      case 'browser':
        return this.browser(context)
      case 'github':
        return this.github(context)
      case 'filesystem':
        return this.filesystem(inputs, context)
      case 'python':
        return this.python(inputs, context)
      case 'rag':
        return this.rag(inputs, context)
      case 'finetune':
        return this.finetune(inputs, context)
      case 'output':
        return this.output(inputs, context)
      case 'trigger':
        return this.trigger(context)
      case 'mcp':
        return this.mcp(inputs, context)
      case 'agent':
        return this.agent(inputs, context)
      case 'subbrain':
        return this.subbrain(context)
      case 'gate':
        return this.gate(inputs, context)
      case 'tool':
        return this.tool(inputs, context)
      default:
        return this.generic(inputs, context)
    }
  }

  private async llm(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    const provider = this.options?.provider
    const memoryHistory = typeof inputs['history'] === 'string' ? inputs['history'] : ''
    const node = context.brain.nodes.find((entry) => entry.id === context.currentNodeId)
    const userMessage =
      typeof node?.configuration['userMessage'] === 'string' &&
      node.configuration['userMessage'].trim() !== ''
        ? node.configuration['userMessage'].trim()
        : ''
    const prompt =
      [llmContext(inputs), graphContext(context)]
        .map((part) => part.trim())
        .filter((part) => part !== '')
        .join('\n\n') || 'Respond briefly.'
    const userNote = userMessage !== '' ? `\n\nUser request: ${userMessage}` : ''
    const memoryNote =
      memoryHistory.trim() !== ''
        ? `\n\n(From memory — prior runs of this brain:\n${memoryHistory.trim()})`
        : ''
    const configuredInstructions =
      typeof node?.configuration['instructions'] === 'string' &&
      node.configuration['instructions'].trim() !== ''
        ? node.configuration['instructions'].trim()
        : ''
    if (provider && provider.config.status === 'available') {
      context.log('LLM querying the configured AI provider.', { nodeId: context.currentNodeId })
      const brainProvider = context.brain?.provider
      const model =
        brainProvider?.model && brainProvider.model.trim() !== ''
          ? brainProvider.model
          : provider.config.model
      const completion = await provider.complete({
        messages: [
          {
            role: 'system',
            content:
              configuredInstructions !== ''
                ? configuredInstructions
                : 'You are OpenBrain, an AI agent. Reply in the same language the user wrote in; be concise and useful.',
          },
          { role: 'user', content: `${prompt}${userNote}${memoryNote}` },
        ],
        model,
        temperature: provider.config.temperature,
        maxTokens: brainProvider?.maxTokens ?? provider.config.maxTokens,
        signal: context.signal,
      })
      return { response: completion.content }
    }
    context.log(
      'No AI provider configured — LLM responding with a simulation. Open Settings to connect Fireworks or Ollama.',
      { level: 'warning', nodeId: context.currentNodeId },
    )
    await delay(900 + rand(300), context.signal)
    const logPrompt = `${prompt}${userNote}${memoryNote}`.trim()
    context.log(`LLM reasoning over: ${logPrompt.slice(0, 80)}`, { nodeId: context.currentNodeId })
    return { response: `Draft response generated for "${logPrompt.slice(0, 80)}"` }
  }

  private async local(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    const node = context.brain.nodes.find((entry) => entry.id === context.currentNodeId)
    const configuredModel =
      typeof node?.configuration['model'] === 'string' ? node.configuration['model'] : ''
    const modelId =
      configuredModel !== '' ? configuredModel : (getFallbackCatalog()[0]?.modelId ?? 'onnx-community/SmolLM2-135M-Instruct')
    const prompt = llmContext(inputs) || 'Give a brief, friendly response.'
    context.log(`Local model warming up (${modelId})…`, { nodeId: context.currentNodeId })
    context.log('Local inference runs in your browser — no API key needed', {
      nodeId: context.currentNodeId,
    })
    try {
      const result = await runLocalInference({
        modelId,
        prompt,
        maxNewTokens: 220,
        signal: context.signal,
        onProgress: (progress) => {
          if (progress.phase === 'download') {
            context.log(`Model ${progress.detail}`, { nodeId: context.currentNodeId })
          } else if (progress.phase === 'generate') {
            context.log('Local model generating…', { nodeId: context.currentNodeId })
          }
        },
      })
      context.log(`Local model answered in ${result.tokens} tokens.`, {
        level: 'success',
        nodeId: context.currentNodeId,
      })
      return { response: result.response, modelId }
    } catch (error) {
      if (context.signal.aborted) {
        context.log('Local model stopped by user.', { level: 'warning', nodeId: context.currentNodeId })
        return { response: '' }
      }
      const detail = error instanceof Error ? error.message : String(error)
      context.log(`Local model failed: ${detail}`, { level: 'error', nodeId: context.currentNodeId })
      return {
        response: `Local model could not run on this device (${detail}).`,
        modelId,
        error: detail,
      }
    }
  }

  private async memory(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    await delay(320 + rand(280), context.signal)
    const store = this.options?.memoryStore ?? getBrainMemoryStore()
    const projectId = context.brain.id
    const current = inputs['value']
    const currentText = typeof current === 'string' ? current : JSON.stringify(current ?? '')
    const previous = await store.read(projectId)
    const entry = {
      nodeId: context.currentNodeId ?? 'memory',
      value: currentText,
      updatedAt: new Date().toISOString(),
    }
    const next = current !== undefined ? [...previous.filter((e) => e.nodeId !== entry.nodeId), entry] : previous
    await store.write(projectId, next)
    const historyText = next.map((e) => e.value).join('\n')
    context.log('Memory updated with new context.', { nodeId: context.currentNodeId })
    return { stored: historyText, history: historyText, previousCount: previous.length }
  }

  private async planner(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    const node = context.brain.nodes.find((entry) => entry.id === context.currentNodeId)
    const goal =
      (typeof node?.configuration['goal'] === 'string' && node.configuration['goal'].trim() !== ''
        ? node.configuration['goal'].trim()
        : firstValue(inputs)) || 'the task'
    const plan = splitGoalClauses(goal)
    if (plan.length > 0) {
      context.log(`Planner decomposed "${goal}" into ${plan.length} steps.`, { nodeId: context.currentNodeId })
      return { plan, count: plan.length, goal }
    }
    context.log(`Planner found no actionable decomposition for "${goal}".`, {
      level: 'warning',
      nodeId: context.currentNodeId,
    })
    return { plan: [], count: 0, goal }
  }

  private async browser(context: ExecutionContext): Promise<NodeOutputs> {
    await delay(600 + rand(400), context.signal)
    context.log('Browser fetched live web pages.', { nodeId: context.currentNodeId })
    return { pages: ['https://example.com', 'https://developer.mozilla.org'] }
  }

  private async github(context: ExecutionContext): Promise<NodeOutputs> {
    await delay(600 + rand(400), context.signal)
    context.log('GitHub read repositories and issues.', { nodeId: context.currentNodeId })
    return { repos: ['acme/api-service', 'acme/web-app', 'acme/infra'] }
  }

  private async filesystem(_inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    const node = context.brain.nodes.find((entry) => entry.id === context.currentNodeId)
    const operation = typeof node?.configuration['operation'] === 'string' ? node.configuration['operation'] : 'read'
    const filePath = typeof node?.configuration['path'] === 'string' ? node.configuration['path'] : ''
    if (filePath.trim() === '') {
      const content = typeof node?.configuration['content'] === 'string' ? node.configuration['content'] : ''
      if (content.trim() !== '') {
        context.log('Filesystem using provided content from node configuration.', { nodeId: context.currentNodeId })
        return { content }
      }
      context.log('Filesystem: no file path or content configured.', { level: 'warning', nodeId: context.currentNodeId })
      return { content: '' }
    }
    context.log(`Filesystem: ${operation} "${filePath}" via runtime.`, { nodeId: context.currentNodeId })
    const body: Record<string, unknown> = { op: operation, path: filePath }
    if (operation === 'write') {
      body.content = typeof node?.configuration['content'] === 'string' ? node.configuration['content'] : ''
    }
    const result = await runtimePost('/local/files', body, context.signal)
    if (!result.ok) {
      const reason = typeof result.error === 'string' ? result.error : 'runtime not reachable'
      context.log(`Filesystem failed: ${reason}`, { level: 'error', nodeId: context.currentNodeId })
      return { content: '', error: reason }
    }
    const content = typeof result.content === 'string' ? result.content : ''
    context.log(`Filesystem ${operation} succeeded.`, { level: 'success', nodeId: context.currentNodeId })
    return { content }
  }

  private async python(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    const node = context.brain.nodes.find((entry) => entry.id === context.currentNodeId)
    const source =
      (typeof inputs['source'] === 'string' && inputs['source'].trim() !== ''
        ? inputs['source']
        : typeof node?.configuration['code'] === 'string'
          ? node.configuration['code']
          : '') || 'print("ok")'
    context.log('Python: executing script via runtime.', { nodeId: context.currentNodeId })
    const result = await runtimePost('/local/python', { code: source }, context.signal)
    if (!result.ok) {
      const reason = typeof result.error === 'string' ? result.error : 'runtime not reachable'
      context.log(`Python failed: ${reason}`, { level: 'error', nodeId: context.currentNodeId })
      return { result: null, error: reason, code: null }
    }
    const stdout = typeof result.stdout === 'string' ? result.stdout : ''
    const stderr = typeof result.stderr === 'string' ? result.stderr : ''
    const exitCode = typeof result.code === 'number' ? result.code : 0
    context.log(`Python exited with code ${exitCode}.`, {
      level: exitCode === 0 ? 'success' : 'warning',
      nodeId: context.currentNodeId,
    })
    return { result: stdout, stderr, code: exitCode }
  }

  private async rag(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    const node = context.brain.nodes.find((entry) => entry.id === context.currentNodeId)
    const query = firstValue(inputs) || 'context'
    const knowledgeDir =
      typeof node?.configuration['knowledgeDir'] === 'string' && node.configuration['knowledgeDir'].trim() !== ''
        ? node.configuration['knowledgeDir'].trim()
        : ''
    context.log(`RAG: retrieving documents for "${query}" via runtime.`, { nodeId: context.currentNodeId })
    const body: Record<string, unknown> = { query }
    if (knowledgeDir !== '') body.knowledgeDir = knowledgeDir
    const result = await runtimePost('/local/rag', body, context.signal)
    if (!result.ok) {
      const reason = typeof result.error === 'string' ? result.error : 'runtime not reachable'
      context.log(`RAG failed: ${reason}`, { level: 'error', nodeId: context.currentNodeId })
      return { documents: [], error: reason }
    }
    const documents = Array.isArray(result.documents) ? result.documents : []
    context.log(`RAG retrieved ${documents.length} document(s).`, {
      level: documents.length > 0 ? 'success' : 'warning',
      nodeId: context.currentNodeId,
    })
    return { documents }
  }

  private async finetune(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    const dataset = firstValue(inputs) || 'unknown dataset'
    const node = context.brain.nodes.find((entry) => entry.id === context.currentNodeId)
    const baseModel =
      typeof node?.configuration['baseModel'] === 'string' && node.configuration['baseModel'].trim() !== ''
        ? node.configuration['baseModel'].trim()
        : typeof inputs['baseModel'] === 'string' && inputs['baseModel'].trim() !== ''
          ? inputs['baseModel']
          : 'unknown base model'
    const slug = baseModel.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
    context.log(
      `Fine-tune planned: base=${baseModel}, dataset=${dataset}, slug=${slug}. Submit a job from the Fine-tune panel.`,
      { nodeId: context.currentNodeId },
    )
    return { status: 'planned', baseModel, dataset, slug, model: null }
  }

  private async output(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    await delay(300 + rand(200), context.signal)
    const value = inputs['result']
    const summary =
      typeof value === 'string' ? value : value === undefined ? '—' : JSON.stringify(value)
    context.log(`Output delivered: ${summary.slice(0, 80)}`, { level: 'success', nodeId: context.currentNodeId })
    if (value !== undefined && inputs['download'] !== false && reportDownloadEnabled) {
      try {
        context.setNodeOutputs(context.currentNodeId ?? '', { result: value })
        const markdown = buildRunReport(context)
        downloadReport(markdown, `${context.brain.name || 'brain'}-report.md`)
        context.log('Report downloaded.', { level: 'success', nodeId: context.currentNodeId })
      } catch (error) {
        context.log(`Report download failed: ${error instanceof Error ? error.message : String(error)}`, {
          level: 'error',
          nodeId: context.currentNodeId,
        })
      }
    }
    return value === undefined ? {} : { result: value }
  }

  private async trigger(context: ExecutionContext): Promise<NodeOutputs> {
    await delay(150 + rand(100), context.signal)
    context.log('Trigger fired.', { nodeId: context.currentNodeId })
    return { signal: 'go' }
  }

  private async mcp(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    await delay(500 + rand(300), context.signal)
    const input = firstValue(inputs) || 'no input'
    context.log(`MCP tool called with "${input}".`, { nodeId: context.currentNodeId })
    return { result: { tool: 'example-mcp', input, ok: true } }
  }

  private async agent(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    const provider = this.options?.provider
    const node = context.brain.nodes.find((entry) => entry.id === context.currentNodeId)
    const task =
      (typeof node?.configuration['task'] === 'string' && node.configuration['task'].trim() !== ''
        ? node.configuration['task'].trim()
        : firstValue(inputs)) || 'the task'
    if (!provider || provider.config.status !== 'available') {
      context.log(
        'Agent node needs an AI provider. Open Settings to connect Fireworks or Ollama.',
        { level: 'warning', nodeId: context.currentNodeId },
      )
      return { result: null, error: 'no AI provider configured' }
    }
    context.log(`Agent: delegating "${task}" to a sub-agent.`, { nodeId: context.currentNodeId })
    const brainProvider = context.brain?.provider
    const model =
      brainProvider?.model && brainProvider.model.trim() !== ''
        ? brainProvider.model
        : provider.config.model
    const completion = await provider.complete({
      messages: [
        {
          role: 'system',
          content:
            'You are a focused sub-agent of an OpenBrain graph. Use only the context given to you. Answer the task concisely and do not repeat instructions.',
        },
        { role: 'user', content: task },
      ],
      model,
      temperature: provider.config.temperature,
      maxTokens: brainProvider?.maxTokens ?? provider.config.maxTokens,
      signal: context.signal,
    })
    context.log(`Agent completed: "${task}"`, { level: 'success', nodeId: context.currentNodeId })
    return { result: completion.content }
  }

  private async subbrain(context: ExecutionContext): Promise<NodeOutputs> {
    context.log(
      'Sub-brain nodes execute through WorkerNodeExecutor when the worker runtime is configured.',
      { level: 'warning', nodeId: context.currentNodeId },
    )
    return { result: { status: 'requires-worker-runtime' } }
  }

  private async gate(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    const node = context.brain.nodes.find((entry) => entry.id === context.currentNodeId)
    const expression =
      typeof node?.configuration['condition'] === 'string' ? node.configuration['condition'] : ''
    const value = firstValue(inputs)
    const { passed, reason } = evaluateGateCondition(expression, value)
    context.log(reason, {
      level: passed ? 'success' : 'warning',
      nodeId: context.currentNodeId,
    })
    return { passed }
  }

  private async tool(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    const input = firstValue(inputs) || 'no input'
    context.log(
      'The generic "tool" node does not run directly. Replace it with a specific tool node (GitHub, MCP, Browser, ImageGen, or News) which connects to a real tool backend.',
      { level: 'warning', nodeId: context.currentNodeId },
    )
    return { result: { input, note: 'use a specific tool node type' } }
  }

  private async generic(_inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    context.log(
      `Unknown node type "${this.type}". Replace this node with a known type: llm, memory, planner, browser, github, filesystem, python, rag, finetune, output, trigger, mcp, agent, subbrain, gate, or a specific tool node.`,
      { level: 'warning', nodeId: context.currentNodeId },
    )
    return { result: null, error: `unknown node type "${this.type}"` }
  }
}

// Registers a MockNodeExecutor for every known node type. Tool-specific nodes
// (browser, github, mcp, imagegen, news) are overridden at registration by
// WorkerNodeExecutor.getRegistry, which maps them to real ToolNodeExecutor
// calls against the configured tool backends.
export function createMockExecutors(options?: MockExecutorsOptions): Readonly<Record<string, NodeExecutor>> {
  const executors: Record<string, NodeExecutor> = {}
  for (const entry of NODE_CATALOG) {
    executors[entry.type] = new MockNodeExecutor(entry.type, options)
  }
  return executors
}
