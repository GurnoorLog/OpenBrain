import type { EntityId } from './common'
import type { EdgeMetadata } from './metadata'

export interface BrainEdge {
  readonly id: EntityId
  readonly source: EntityId
  readonly sourcePort: string
  readonly target: EntityId
  readonly targetPort: string
  readonly label?: string
  readonly animated: boolean
  readonly metadata: EdgeMetadata
}
