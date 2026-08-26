import type { ExecutionContext } from './ExecutionContext'
import type { NodeInputs, NodeOutputs } from './NodeExecutor'
import type { ToolDefinition } from '../tools/toolRegistry'

// Real executor for a tool from the registry. Reads the tool's API key from
// localStorage at runtime (the architect never sees it) and fails with a clear
// message if a keyed tool is missing its key.
export class ToolNodeExecutor {
  constructor(private readonly tool: ToolDefinition) {}

  async execute(inputs: NodeInputs, context: ExecutionContext): Promise<NodeOutputs> {
    // A key stored by the user (Settings → Tool keys) wins; otherwise fall back
    // to the key bundled at build time via the tool's VITE_* env hint so the
    // demo works without the user configuring anything.
    const apiKey = this.tool.needsKey
      ? (localStorage.getItem(this.tool.keyStorageKey) ??
        (import.meta.env[this.tool.keyEnvHint] as string | undefined) ??
        null)
      : null
    if (this.tool.needsKey && !apiKey) {
      throw new Error(
        `${this.tool.name} needs an API key to run. Add it via Settings → Tool keys, then run again.`,
      )
    }
    return this.tool.execute(inputs, context, apiKey)
  }
}
