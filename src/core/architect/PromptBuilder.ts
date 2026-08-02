import type { NodePort, NodeType, ProviderConfiguration, ProviderId, ProviderKind, ProviderMessage } from '../domain'
import type { DesignRequest } from './ArchitectProvider'

export interface NodeCatalogEntry {
  readonly type: NodeType
  readonly description: string
  readonly inputs: readonly NodePort[]
  readonly outputs: readonly NodePort[]
}

export const NODE_CATALOG: readonly NodeCatalogEntry[] = [
  {
    type: 'llm',
    description: 'Reason and generate language',
    inputs: [{ id: 'context', label: 'Context', kind: 'text' }],
    outputs: [{ id: 'response', label: 'Response', kind: 'text' }],
  },
  {
    type: 'local',
    description: 'Run a model in the browser, no API key',
    inputs: [{ id: 'context', label: 'Context', kind: 'text' }],
    outputs: [{ id: 'response', label: 'Response', kind: 'text' }],
  },
  {
    type: 'memory',
    description: 'Persist conversation context',
    inputs: [{ id: 'value', label: 'Value', kind: 'any' }],
    outputs: [{ id: 'stored', label: 'Stored', kind: 'any' }],
  },
  {
    type: 'planner',
    description: 'Break goals into steps',
    inputs: [{ id: 'goal', label: 'Goal', kind: 'text' }],
    outputs: [{ id: 'plan', label: 'Plan', kind: 'list' }],
  },
  {
    type: 'browser',
    description: 'Fetch the text of a live web page',
    inputs: [{ id: 'url', label: 'URL', kind: 'text' }],
    outputs: [
      { id: 'pages', label: 'Pages', kind: 'list' },
      { id: 'content', label: 'Content', kind: 'text' },
    ],
  },
  {
    type: 'github',
    description: 'Read repositories and issues',
    inputs: [],
    outputs: [{ id: 'repos', label: 'Repos', kind: 'list' }],
  },
  {
    type: 'filesystem',
    description: 'Read and write local files',
    inputs: [{ id: 'path', label: 'Path', kind: 'text' }],
    outputs: [{ id: 'content', label: 'Content', kind: 'text' }],
  },
  {
    type: 'python',
    description: 'Run Python scripts',
    inputs: [{ id: 'code', label: 'Code', kind: 'text' }],
    outputs: [{ id: 'result', label: 'Result', kind: 'text' }],
  },
  {
    type: 'rag',
    description: 'Retrieve from knowledge base',
    inputs: [{ id: 'query', label: 'Query', kind: 'text' }],
    outputs: [{ id: 'documents', label: 'Documents', kind: 'list' }],
  },
  {
    type: 'finetune',
    description: 'Train a model on a dataset (dry-run: plan only, never submits)',
    inputs: [
      { id: 'dataset', label: 'Dataset', kind: 'text' },
      { id: 'baseModel', label: 'Base model', kind: 'text' },
    ],
    outputs: [{ id: 'model', label: 'Trained model', kind: 'text' }],
  },
  {
    type: 'news',
    description: 'Fetch live news articles for a topic',
    inputs: [{ id: 'query', label: 'Query', kind: 'text' }],
    outputs: [
      { id: 'articles', label: 'Articles', kind: 'list' },
      { id: 'headline', label: 'Headline', kind: 'text' },
    ],
  },
  {
    type: 'imagegen',
    description: 'Generate an image from a prompt',
    inputs: [{ id: 'prompt', label: 'Prompt', kind: 'text' }],
    outputs: [{ id: 'imageUrl', label: 'Image URL', kind: 'text' }],
  },
  {
    type: 'output',
    description: 'Deliver the final result; downloads a Markdown report',
    inputs: [
      { id: 'result', label: 'Result', kind: 'any' },
      { id: 'download', label: 'Download report', kind: 'boolean' },
    ],
    outputs: [],
  },
  {
    type: 'mcp',
    description: 'Call an external MCP tool',
    inputs: [{ id: 'input', label: 'Input', kind: 'any' }],
    outputs: [{ id: 'result', label: 'Result', kind: 'any' }],
  },
  {
    type: 'agent',
    description: 'Delegate to a sub-agent',
    inputs: [{ id: 'task', label: 'Task', kind: 'text' }],
    outputs: [{ id: 'result', label: 'Result', kind: 'any' }],
  },
  {
    type: 'subbrain',
    description: 'Invoke another Brain',
    inputs: [],
    outputs: [{ id: 'result', label: 'Result', kind: 'any' }],
  },
  {
    type: 'trigger',
    description: 'Start a flow on an event',
    inputs: [],
    outputs: [{ id: 'signal', label: 'Signal', kind: 'any' }],
  },
  {
    type: 'gate',
    description: 'Branch on a condition',
    inputs: [{ id: 'condition', label: 'Condition', kind: 'boolean' }],
    outputs: [{ id: 'passed', label: 'Passed', kind: 'any' }],
  },
  {
    type: 'tool',
    description: 'Run a local tool',
    inputs: [{ id: 'input', label: 'Input', kind: 'any' }],
    outputs: [{ id: 'result', label: 'Result', kind: 'any' }],
  },
]

export function getNodeCatalogEntry(type: NodeType): NodeCatalogEntry | undefined {
  return NODE_CATALOG.find((entry) => entry.type === type)
}

export interface ProviderCatalogEntry {
  readonly id: ProviderId
  readonly name: string
  readonly kind: ProviderKind
  readonly defaultModel: string
}

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  { id: 'fireworks', name: 'Fireworks AI', kind: 'cloud', defaultModel: 'accounts/fireworks/models/deepseek-v4-flash' },
  { id: 'ollama', name: 'Ollama', kind: 'local', defaultModel: 'qwen2.5:7b' },
]

export interface PromptBuildOptions {
  readonly provider?: ProviderConfiguration
  readonly temperature?: number
  readonly maxTokens?: number
}

export interface StructuredPrompt {
  readonly messages: readonly ProviderMessage[]
  readonly temperature: number
  readonly maxTokens: number
}

export class PromptBuilder {
  build(request: DesignRequest, options: PromptBuildOptions = {}): StructuredPrompt {
    return {
      messages: [
        { role: 'system', content: this.buildSystemPrompt(options) },
        { role: 'user', content: this.buildUserPrompt(request) },
      ],
      temperature: options.temperature ?? 0.4,
      maxTokens: options.maxTokens ?? 8192,
    }
  }

  buildSystemPrompt(options: PromptBuildOptions = {}): string {
    return [
      this.instructions(),
      this.nodeCatalogPrompt(),
      this.providerCatalogPrompt(options.provider),
      this.capabilitiesPrompt(),
      this.outputSchemaPrompt(),
    ].join('\n\n')
  }

  buildUserPrompt(request: DesignRequest): string {
    const parts: string[] = [request.prompt]
    const context = request.context
    if (context) {
      const lines: string[] = []
      if (context.providerId) lines.push(`Preferred provider: ${context.providerId}`)
      if (context.model) lines.push(`Preferred model: ${context.model}`)
      if (context.constraints && context.constraints.length > 0) {
        lines.push(`Constraints: ${context.constraints.join(', ')}`)
      }
      if (lines.length > 0) parts.push(`Context:\n${lines.join('\n')}`)
    }
    return parts.join('\n\n')
  }

  private instructions(): string {
    return [
      'You are the AI Architect for OpenBrain.',
      'You translate a natural-language request into a precise, executable Brain specification.',
      'Design is reasoning-only: you never run code, access a canvas, or touch execution.',
      'Prefer the smallest acyclic graph that satisfies the request.',
      'Respond with one JSON object only - no markdown, no prose outside the JSON.',
      '',
      'STRICT GRAPH RULES (violating these invalidates your answer):',
      '- Your graph MUST contain exactly one "output" node and at least one "llm" node.',
      '- Every node type you use MUST be from the Available node types list below.',
      '- Every edge source/target MUST reference a node id you declared in "nodes".',
      '- Edges MUST form an acyclic graph - no cycles, no self-loops. Each node must not have multiple parents unless it truly combines them.',
      '- Keep the graph small and linear for simple requests: an input source, an llm, then the "output" node.',
      '- A typical/healthy answer has 3-5 nodes. A degenerate 1-2 node answer is a FAILURE.',
      '- The "output" node MUST be present and MUST be the final sink - every pipeline must flow into it.',
      '- Node ids must be unique, lowercase words separated by dashes (e.g. "recipe-llm", "kitchen-data").',
      '- Edges describe data flow; the last edge must target the "output" node.',
      '- Explicit capabilities the user NAMES in their request MUST be realized as the matching node type and wired into the graph. Memory ("remember", "persist context") => a "memory" node; "browse the web" / live pages => a "browser" node; image generation => an "imagegen" node; news => a "news" node. Do not mention the capability without adding its node.',
      '- Every data source node you add (browser, filesystem, news, imagegen) MUST connect its output into the "llm" node so the model actually reads that data; a source node whose output reaches nobody is a FAILURE.',
      '- When a "memory" node is used it MUST receive an incoming edge on its "value" input (so it has something to persist) and its output MUST feed the "llm" node. Correct pattern: filesystem -> memory -> llm -> output.',
    ].join('\n')
  }

  private nodeCatalogPrompt(): string {
    const lines = NODE_CATALOG.map((entry) => {
      const input = entry.inputs.length > 0 ? entry.inputs.map((port) => port.id).join('|') : 'none'
      const output = entry.outputs.length > 0 ? entry.outputs.map((port) => port.id).join('|') : 'none'
      return `- ${entry.type}: ${entry.description} (in:${input}, out:${output})`
    })
    return `Available node types:\n${lines.join('\n')}`
  }

  private providerCatalogPrompt(active?: ProviderConfiguration): string {
    const lines = PROVIDER_CATALOG.map((entry) => `- ${entry.id} (${entry.kind}, default model: ${entry.defaultModel})`)
    if (active) {
      lines.push(`Active provider for this design: ${active.providerId} (model: ${active.model}).`)
    }
    return `Available providers:\n${lines.join('\n')}`
  }

  private capabilitiesPrompt(): string {
    return [
      'Capabilities you may recommend:',
      '- Memory: working / long-term / episodic / semantic memory scoped to a brain, global, or shared.',
      '- Knowledge: RAG knowledge bases with chunk size, overlap, and retrieval strategy.',
      '- Execution: "manual" (user triggers) or "auto" (dependencies run automatically).',
      '- MCP tools, marketplaces, and external services can be referenced as future capability nodes.',
    ].join('\n')
  }

  private outputSchemaPrompt(): string {
    return [
      'Return a single JSON object matching this exact shape. ALL fields are REQUIRED unless marked optional:',
      '{',
      '  "name": string,',
      '  "description": string,',
      '  "goal": string,',
      '  "providerRecommendation": "fireworks" | "ollama",',
      '  "modelRecommendation": string,',
      '  "memoryRecommendation": { "enabled": boolean, "kind": string, "scope": string },',
      '  "knowledgeRecommendation": { "required": boolean, "sourceTypes": string[] },',
      '  "executionMode": "manual" | "auto",',
'"nodes": [',
      '    { "id": string, "type": <a node type>, "title": string, "description": string,',
      '      "reason": string, "configuration": object,',
      '      "positionHint": { "column": number, "row": number },',
      '      "required": boolean }',
      '  ],',
      '  "edges": [ { "source": <node id>, "target": <node id>, "reason": string } ],',
      '  "reasoning": string,',
      '  "warnings": string[],',
      '  "metadata": {}',
      '}',
      '',
      'VALID EXAMPLE (recipe assistant):',
      '{',
      '  "name": "Fridge Recipe Helper",',
      '  "description": "Turns pantry ingredients into meal ideas",',
      '  "goal": "Suggest recipes from available ingredients",',
      '  "providerRecommendation": "fireworks",',
      '  "modelRecommendation": "accounts/fireworks/models/deepseek-v4-flash",',
      '  "memoryRecommendation": { "enabled": false, "kind": "working", "scope": "brain" },',
      '  "knowledgeRecommendation": { "required": false, "sourceTypes": ["documents"] },',
      '  "executionMode": "auto",',
      '  "nodes": [',
      '    { "id": "fridge-input", "type": "filesystem", "title": "Fridge Ingredients", "description": "List what is in the fridge", "reason": "Start here", "configuration": {}, "positionHint": { "column": 0, "row": 0 }, "required": true },',
      '    { "id": "recipe-llm", "type": "llm", "title": "Recipe Generator", "description": "Suggests meals from ingredients", "reason": "Core reasoning", "configuration": {}, "positionHint": { "column": 1, "row": 0 }, "required": true },',
      '    { "id": "recipe-output", "type": "output", "title": "Meal Plan", "description": "Returns the suggestions", "reason": "Deliver result", "configuration": {}, "positionHint": { "column": 2, "row": 0 }, "required": true }',
      '  ],',
      '  "edges": [',
      '    { "source": "fridge-input", "target": "recipe-llm", "reason": "Feed ingredients to the generator" },',
      '    { "source": "recipe-llm", "target": "recipe-output", "reason": "Send recipes to the output" }',
      '  ],',
      '  "reasoning": "A simple linear pipeline",',
      '  "warnings": [],',
      '  "metadata": {}',
      '}',
      '',
      'Follow the STRICT GRAPH RULES exactly. The graph MUST have 3-5 nodes including an "output" node and an "llm" node.',
    ].join('\n')
  }
}
