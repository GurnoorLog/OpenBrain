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

const rand = (max: number): number => Math.floor(Math.random() * max)

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

// Default executor for every node type. Simulates work (delay + canned
// output) so the whole pipeline is runnable before real executors exist.
// For LLM nodes it uses the AIProvider interface only when one is supplied
// and configured; otherwise it simulates a completion.
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
        return this.filesystem(context)
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
    const prompt = llmContext(inputs) || 'Respond briefly.'
    const memoryNote =
      memoryHistory.trim() !== ''
        ? `\n\n(From memory — prior runs of this brain:\n${memoryHistory.trim()})`
        : ''
    if (provider && provider.config.status === 'available') {
      context.log('LLM querying the configured AI provider.', { nodeId: context.currentNodeId })
      // Honor the model the architect/brain chose; fall back to the provider's
      // own default so a brain without an explicit model still works.
      const brainProvider = context.brain?.provider
      const model =
        brainProvider?.model && brainProvider.model.trim() !== ''
          ? brainProvider.model
          : provider.config.model
      const completion = await provider.complete({
        // Default system prompt: match the user's language so a Chinese-origin
        // model (deepseek) doesn't answer casual English input in Chinese.
        messages: [
          {
            role: 'system',
            content:
              'You are OpenBrain, an AI agent. Reply in the same language the user wrote in; be concise and useful.',
          },
          { role: 'user', content: `${prompt}${memoryNote}` },
        ],
        model,
        temperature: provider.config.temperature,
        maxTokens: brainProvider?.maxTokens ?? provider.config.maxTokens,
        signal: context.signal,
      })
      return { response: completion.content }
    }
    await delay(900 + rand(300), context.signal)
    const logPrompt = `${prompt}${memoryNote}`.trim()
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
    // `stored` carries the FULL accumulated history so a memory -> llm edge
    // feeds every prior run into the model (cross-run memory).
    return { stored: historyText, history: historyText, previousCount: previous.length }
  }

  private async planner(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    await delay(500 + rand(300), context.signal)
    const goal = firstValue(inputs) || 'the task'
    context.log(`Planner decomposed: ${goal}`, { nodeId: context.currentNodeId })
    return { plan: ['Gather information', 'Analyze inputs', 'Synthesize result', 'Deliver output'] }
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

  private async filesystem(context: ExecutionContext): Promise<NodeOutputs> {
    await delay(400 + rand(300), context.signal)
    const node = context.brain.nodes.find((entry) => entry.id === context.currentNodeId)
    const content =
      typeof node?.configuration['content'] === 'string' ? node.configuration['content'] : ''
    if (content.trim() !== '') {
      context.log('Filesystem read user-provided content.', { nodeId: context.currentNodeId })
      return { content }
    }
    context.log('Filesystem read local files.', { nodeId: context.currentNodeId })
    return { content: '# README\n\nProject scaffold initialized.\n\n- 12 source files\n- 4 modules\n' }
  }

  private async python(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    await delay(500 + rand(400), context.signal)
    const source = firstValue(inputs) || 'print("ok")'
    context.log('Python executed script.', { nodeId: context.currentNodeId })
    return { result: `Executed ${source.length} chars → "ok"` }
  }

  private async rag(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    await delay(550 + rand(350), context.signal)
    const query = firstValue(inputs) || 'context'
    context.log(`RAG retrieved documents for "${query}".`, { nodeId: context.currentNodeId })
    return {
      documents: [
        `knowledge#1 — ${query} basics`,
        `knowledge#2 — ${query} advanced`,
        `knowledge#3 — ${query} patterns`,
      ],
    }
  }

  private async finetune(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    await delay(800 + rand(500), context.signal)
    const dataset = firstValue(inputs) || 'unknown dataset'
    const baseModel =
      typeof inputs['baseModel'] === 'string' && inputs['baseModel'] !== ''
        ? inputs['baseModel']
        : 'unknown base model'
    context.log(`Fine-tune planned on ${baseModel} using ${dataset} (dry-run, nothing submitted).`, {
      nodeId: context.currentNodeId,
    })
    const slug = baseModel.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
    return { model: `hf://fine-tune-${slug || 'model'}` }
  }

  private async output(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    await delay(300 + rand(200), context.signal)
    const value = inputs['result']
    const summary =
      typeof value === 'string' ? value : value === undefined ? '—' : JSON.stringify(value)
    context.log(`Output delivered: ${summary.slice(0, 80)}`, { level: 'success', nodeId: context.currentNodeId })
    if (value !== undefined && inputs['download'] !== false) {
      try {
        // Record this node's output before building the report, otherwise the
        // report's Node Outputs section omits the final result.
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
    await delay(700 + rand(400), context.signal)
    const task = firstValue(inputs) || 'the task'
    context.log(`Agent delegated: ${task}`, { nodeId: context.currentNodeId })
    return { result: `Sub-agent reported back on "${task}"` }
  }

  private async subbrain(context: ExecutionContext): Promise<NodeOutputs> {
    await delay(650 + rand(400), context.signal)
    context.log('Sub-brain invoked.', { nodeId: context.currentNodeId })
    return { result: { nested: true, status: 'ok' } }
  }

  private async gate(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    await delay(200 + rand(100), context.signal)
    const passed = inputs['condition'] !== false
    context.log(passed ? 'Gate passed.' : 'Gate blocked.', { nodeId: context.currentNodeId })
    return { passed }
  }

  private async tool(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    await delay(400 + rand(300), context.signal)
    const input = firstValue(inputs) || 'no input'
    context.log(`Local tool ran with "${input}".`, { nodeId: context.currentNodeId })
    return { result: { tool: 'example-tool', input, ok: true } }
  }

  private async generic(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    await delay(400 + rand(300), context.signal)
    context.log('Node executed with canned output.', { nodeId: context.currentNodeId })
    return { result: { processed: Object.keys(inputs), ok: true } }
  }
}

// Registers a MockNodeExecutor for every known node type. Later, real
// executors can be swapped in per type on the same registry.
export function createMockExecutors(options?: MockExecutorsOptions): Readonly<Record<string, NodeExecutor>> {
  const executors: Record<string, NodeExecutor> = {}
  for (const entry of NODE_CATALOG) {
    executors[entry.type] = new MockNodeExecutor(entry.type, options)
  }
  return executors
}
