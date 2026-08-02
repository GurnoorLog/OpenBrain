import type { ExecutionContext } from './ExecutionContext'
import type { NodeInputs, NodeOutputs } from './NodeExecutor'
import type { ToolDefinition } from '../tools/toolRegistry'

// Real executor for a tool from the registry. Reads the tool's API key from
// localStorage at runtime (the architect never sees it) and fails with a clear
// message if a keyed tool is missing its key.
export class ToolNodeExecutor {
  constructor(private readonly tool: ToolDefinition) {}

  async execute(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    const apiKey = this.tool.needsKey ? localStorage.getItem(this.tool.keyStorageKey) : null
    if (this.tool.needsKey && !apiKey) {
      throw new Error(
        `${this.tool.name} needs an API key to run. Add it via Settings → Tool keys, then run again.`,
      )
    }
    return this.tool.execute(inputs, context, apiKey)
  }
}
