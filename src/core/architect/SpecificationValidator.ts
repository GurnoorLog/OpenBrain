import type { BrainSpecification } from './BrainSpecification'
import { NODE_CATALOG } from './PromptBuilder'
import { ArchitectValidationError } from './ArchitectErrors'

export enum SpecificationErrorCode {
  EmptyGraph = 'empty_graph',
  DuplicateNodeId = 'duplicate_node_id',
  UnsupportedNodeType = 'unsupported_node_type',
  MissingNodeReference = 'missing_node_reference',
  UnsupportedProvider = 'unsupported_provider',
  MissingOutputNode = 'missing_output_node',
  MissingLlmNode = 'missing_llm_node',
  CircularDependency = 'circular_dependency',
}

export interface SpecificationError {
  readonly code: SpecificationErrorCode
  readonly message: string
  readonly nodeId?: string
  readonly edgeIndex?: number
}

const KNOWN_PROVIDERS: ReadonlySet<string> = new Set(['fireworks', 'ollama'])

const SUPPORTED_NODE_TYPES: ReadonlySet<string> = new Set(NODE_CATALOG.map((entry) => entry.type))

export class SpecificationValidator {
  validate(specification: BrainSpecification): readonly SpecificationError[] {
    const errors: SpecificationError[] = []
    const nodeIds = new Set<string>()
    const seen = new Set<string>()

    if (specification.nodes.length === 0) {
      errors.push({ code: SpecificationErrorCode.EmptyGraph, message: 'Brain specification has no nodes.' })
    }

    specification.nodes.forEach((node) => {
      if (seen.has(node.id)) {
        errors.push({
          code: SpecificationErrorCode.DuplicateNodeId,
          message: `Duplicate node id "${node.id}".`,
          nodeId: node.id,
        })
      }
      seen.add(node.id)
      nodeIds.add(node.id)
      if (!SUPPORTED_NODE_TYPES.has(node.type)) {
        errors.push({
          code: SpecificationErrorCode.UnsupportedNodeType,
          message: `Node "${node.id}" uses unsupported type "${node.type}".`,
          nodeId: node.id,
        })
      }
    })

    specification.edges.forEach((edge, index) => {
      if (!nodeIds.has(edge.source)) {
        errors.push({
          code: SpecificationErrorCode.MissingNodeReference,
          message: `Edge ${index} references missing source node "${edge.source}".`,
          edgeIndex: index,
        })
      }
      if (!nodeIds.has(edge.target)) {
        errors.push({
          code: SpecificationErrorCode.MissingNodeReference,
          message: `Edge ${index} references missing target node "${edge.target}".`,
          edgeIndex: index,
        })
      }
    })

    if (!specification.nodes.some((node) => node.type === 'output')) {
      errors.push({ code: SpecificationErrorCode.MissingOutputNode, message: 'Brain specification is missing an "output" node.' })
    }
    if (!specification.nodes.some((node) => node.type === 'llm')) {
      errors.push({ code: SpecificationErrorCode.MissingLlmNode, message: 'Brain specification is missing an "llm" node.' })
    }
    if (!KNOWN_PROVIDERS.has(specification.providerRecommendation)) {
      errors.push({
        code: SpecificationErrorCode.UnsupportedProvider,
        message: `Unsupported provider recommendation "${specification.providerRecommendation}".`,
      })
    }
    if (this.hasCycle(specification)) {
      errors.push({ code: SpecificationErrorCode.CircularDependency, message: 'Brain graph contains a circular dependency.' })
    }

    return errors
  }

  validateOrThrow(specification: BrainSpecification): void {
    const errors = this.validate(specification)
    if (errors.length > 0) {
      throw new ArchitectValidationError(errors)
    }
  }

  private hasCycle(specification: BrainSpecification): boolean {
    const indegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()
    for (const node of specification.nodes) {
      indegree.set(node.id, 0)
      adjacency.set(node.id, [])
    }
    for (const edge of specification.edges) {
      if (!indegree.has(edge.source) || !indegree.has(edge.target)) continue
      adjacency.get(edge.source)?.push(edge.target)
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    }
    const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id)
    let visited = 0
    while (queue.length > 0) {
      const id = queue.shift()
      if (id === undefined) break
      visited += 1
      for (const next of adjacency.get(id) ?? []) {
        const degree = (indegree.get(next) ?? 0) - 1
        indegree.set(next, degree)
        if (degree === 0) queue.push(next)
      }
    }
    return visited < indegree.size
  }
}
