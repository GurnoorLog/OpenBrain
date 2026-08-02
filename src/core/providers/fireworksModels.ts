// Curated, verified Fireworks AI model catalog. IDs were pulled from the
// Fireworks /inference/v1/models endpoint so every entry is real and callable.
// The architect recommends one of these via modelRecommendation, the settings
// panel lets users switch the active model, and the LLM executor honors the
// brain's chosen model at run time.

export interface FireworksModelOption {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly contextWindow: number
  readonly maxTokens: number
  readonly recommended?: boolean
}

export const FIREWORKS_MODELS: readonly FireworksModelOption[] = [
  {
    id: 'accounts/fireworks/models/deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    description: 'Fast, low-latency default. Great for quick reasoning and chat.',
    contextWindow: 65536,
    maxTokens: 8192,
    recommended: true,
  },
  {
    id: 'accounts/fireworks/models/deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    description: 'The stronger DeepSeek model — deeper reasoning for complex brains.',
    contextWindow: 131072,
    maxTokens: 16384,
  },
  {
    id: 'accounts/fireworks/models/glm-5p2',
    name: 'GLM 5.2',
    description: 'Flagship GLM model with strong instruction following and long context.',
    contextWindow: 131072,
    maxTokens: 16384,
  },
  {
    id: 'accounts/fireworks/models/kimi-k3',
    name: 'Kimi K3',
    description: 'High-quality general model from Moonshot AI.',
    contextWindow: 131072,
    maxTokens: 16384,
  },
  {
    id: 'accounts/fireworks/models/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    description: 'Large open-source model tuned for agentic and tool-heavy tasks.',
    contextWindow: 131072,
    maxTokens: 16384,
  },
  {
    id: 'accounts/fireworks/models/qwen3p7-plus',
    name: 'Qwen3.7 Plus',
    description: 'Alibaba Qwen flagship — strong reasoning and multilingual output.',
    contextWindow: 131072,
    maxTokens: 16384,
  },
  {
    id: 'accounts/fireworks/models/minimax-m3',
    name: 'MiniMax M3',
    description: 'Balanced performance and speed for production workloads.',
    contextWindow: 131072,
    maxTokens: 16384,
  },
  {
    id: 'accounts/fireworks/models/minimax-m2p7',
    name: 'MiniMax M2.7',
    description: 'Cost-efficient generation model with solid quality.',
    contextWindow: 65536,
    maxTokens: 8192,
  },
]

export const FIREWORKS_DEFAULT_MODEL_ID = FIREWORKS_MODELS[0].id

export function isFireworksModel(id: string): boolean {
  return FIREWORKS_MODELS.some((model) => model.id === id)
}
