import type { Brain, EntityId } from '../domain'
import { ExecutionCycleError, ExecutionInvalidGraphError } from './ExecutionErrors'

// Computes the execution order of a Brain graph via Kahn's topological sort.
// Extends the same pattern used in SpecificationValidator and LayoutEngine:
// returns a deterministic order or throws when the graph is invalid.
export class ExecutionScheduler {
  computeOrder(brain: Brain): readonly EntityId[] {
    const nodes = brain.nodes
    if (nodes.length === 0) return []

    const nodeIds = new Set(nodes.map((node) => node.id))
    for (const edge of brain.edges) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        throw new ExecutionInvalidGraphError(`Edge "${edge.id}" references a missing node.`)
      }
    }

    const indegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()
    for (const node of nodes) {
      indegree.set(node.id, 0)
      adjacency.set(node.id, [])
    }
    for (const edge of brain.edges) {
      adjacency.get(edge.source)?.push(edge.target)
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    }

    const ready = [...indegree.entries()]
      .filter(([, degree]) => degree === 0)
      .map(([id]) => id)
      .sort()
      .reverse()
    const order: string[] = []
    while (ready.length > 0) {
      const id = ready.pop()!
      order.push(id)
      for (const next of adjacency.get(id) ?? []) {
        const degree = (indegree.get(next) ?? 0) - 1
        indegree.set(next, degree)
        if (degree === 0) ready.push(next)
      }
    }

    if (order.length !== nodes.length) {
      const remaining = nodes.filter((node) => !order.includes(node.id)).map((node) => node.id)
      throw new ExecutionCycleError(remaining)
    }
    return order
  }
}
