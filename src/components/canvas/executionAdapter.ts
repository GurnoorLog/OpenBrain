import type { NodeType } from '../../core/domain'
import {
  ExecutionCycleError,
  ExecutionEmptyGraphError,
  ExecutionEngine,
  ExecutionEventType,
  ExecutionEvents,
  NodeExecutorRegistry,
  ToolNodeExecutor,
  createMockExecutors,
} from '../../core/execution'
import { CAPABILITIES } from '../../core/registry'
import type { CapabilityType } from '../../core/types'
import { TOOLS, toolForNodeType } from '../../core/tools/toolRegistry'
import { createFireworksAIProvider } from '../../core/providers/FireworksAIProvider'
import { getBrainMemoryStore } from '../../core/memory/brainMemory'
import { setReportDownloadEnabled } from '../../core/execution/MockNodeExecutor'
import { useBrainStore } from '../../store/useBrainStore'
import { toDomainBrain } from './brainAdapter'

const executorRegistry = new NodeExecutorRegistry()
// LLM nodes run against the real Fireworks API (reads VITE_FIREWORKS_API_KEY)
// so executing a brain produces real reasoning, not canned placeholder text.
executorRegistry.registerAll(
  createMockExecutors({ provider: createFireworksAIProvider(), memoryStore: getBrainMemoryStore() }),
)
for (const tool of TOOLS) {
  executorRegistry.register(tool.nodeType, new ToolNodeExecutor(tool))
}

let activeEngine: ExecutionEngine | null = null

// Aborts the currently running local brain (if any). No-op when idle.
export function stopBrainRun(): void {
  activeEngine?.stop()
}

function nodeLabel(nodeType: NodeType): string {
  return CAPABILITIES[nodeType as CapabilityType]?.label ?? nodeType
}

export interface RunBrainOptions {
  // Chat-driven runs stamp this onto the llm node so the model answers the
  // user's question on top of the browser/memory context from the graph.
  readonly userMessage?: string
  // Chat answers are returned to the pill instead of downloading a report.
  readonly downloadReport?: boolean
}

// Runs the current store graph through the ExecutionEngine. Builds a domain
// Brain from the legacy store shape (same bridge as the renderer), executes
// it, and translates ExecutionEvents back into the existing store actions so
// Agent Log and node status dots update exactly as before. Resolves with the
// output node's result when the run produced one (the chat pill's answer).
export async function runBrain(options: RunBrainOptions = {}): Promise<string | null> {
  const store = useBrainStore.getState()
  if (store.running || store.nodes.length === 0) return null

  const llmNode = store.nodes.find((node) => node.type === 'llm')
  if (options.userMessage !== undefined && llmNode) {
    store.setNodeConfiguration(llmNode.id, { userMessage: options.userMessage })
  }
  setReportDownloadEnabled(options.downloadReport !== false)

  const toolNode = store.nodes.find((node) => {
    const tool = toolForNodeType(node.type)
    return tool && tool.needsKey && !localStorage.getItem(tool.keyStorageKey)
  })
  if (toolNode) {
    const tool = toolForNodeType(toolNode.type)
    if (tool) {
      store.setPendingKeyRequest({
        toolId: tool.id,
        name: tool.name,
        description: tool.description,
        instructions: tool.keyInstructions,
        envHint: tool.keyEnvHint,
      })
      store.addLog(`${tool.name} needs an API key to run`, 'warning')
    }
    return null
  }

  store.setRunning(true)
  store.resetStatuses()
  store.addLog('Runtime initialized — executing brain', 'info')

  const brain = toDomainBrain(store.nodes, store.connections)
  const events = new ExecutionEvents()
  const engine = new ExecutionEngine({ registry: executorRegistry, events })
  activeEngine = engine

  const disposers: (() => void)[] = []
  disposers.push(
    events.on(ExecutionEventType.NodeStarted, (event) => {
      store.setNode(event.nodeId, { status: 'running' })
      store.addLog(`Executing ${nodeLabel(event.nodeType)} node…`, 'info')
    }),
  )
  disposers.push(
    events.on(ExecutionEventType.NodeCompleted, (event) => {
      store.setNode(event.nodeId, { status: 'success', output: event.outputs })
    }),
  )
  disposers.push(
    events.on(ExecutionEventType.NodeFailed, (event) => {
      store.setNode(event.nodeId, { status: 'error', error: event.error })
      store.addLog(`${nodeLabel(event.nodeType)} failed`, 'error')
    }),
  )
  disposers.push(
    events.on(ExecutionEventType.Completed, (event) => {
      store.setRunning(false)
      store.addLog(`Brain finished in ${event.durationMs}ms`, 'success')
    }),
  )
  disposers.push(
    events.on(ExecutionEventType.Failed, (event) => {
      store.setRunning(false)
      store.addLog(
        event.status === 'cancelled' ? 'Brain execution cancelled' : 'Brain execution failed',
        'error',
      )
    }),
  )

  try {
    await engine.run(brain)
  } catch (error) {
    store.setRunning(false)
    if (error instanceof ExecutionCycleError) {
      store.addLog('Graph contains a cycle — execution aborted', 'error')
    } else if (error instanceof ExecutionEmptyGraphError) {
      store.addLog('Brain is empty — nothing to execute', 'error')
    } else {
      store.addLog(`Execution failed: ${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  } finally {
    activeEngine = null
    for (const dispose of disposers) dispose()
  }
  const outputNode = useBrainStore.getState().nodes.find((node) => node.type === 'output')
  const value = outputNode?.output?.['result']
  return typeof value === 'string' ? value : value === undefined ? null : JSON.stringify(value)
}
