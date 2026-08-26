import { BrainLifecycleState } from '../domain'
import { BrainTransitionError } from './errors'

const TRANSITIONS: Readonly<Record<BrainLifecycleState, readonly BrainLifecycleState[]>> = {
  [BrainLifecycleState.Created]: [
    BrainLifecycleState.Designing,
    BrainLifecycleState.Generating,
    BrainLifecycleState.Error,
    BrainLifecycleState.Archived,
  ],
  [BrainLifecycleState.Designing]: [
    BrainLifecycleState.Generating,
    BrainLifecycleState.Ready,
    BrainLifecycleState.Error,
    BrainLifecycleState.Archived,
  ],
  [BrainLifecycleState.Generating]: [
    BrainLifecycleState.Ready,
    BrainLifecycleState.Running,
    BrainLifecycleState.Error,
    BrainLifecycleState.Archived,
  ],
  [BrainLifecycleState.Ready]: [
    BrainLifecycleState.Running,
    BrainLifecycleState.Designing,
    BrainLifecycleState.Error,
    BrainLifecycleState.Archived,
  ],
  [BrainLifecycleState.Running]: [
    BrainLifecycleState.Paused,
    BrainLifecycleState.Ready,
    BrainLifecycleState.Idle,
    BrainLifecycleState.Error,
    BrainLifecycleState.Archived,
  ],
  [BrainLifecycleState.Paused]: [
    BrainLifecycleState.Running,
    BrainLifecycleState.Ready,
    BrainLifecycleState.Idle,
    BrainLifecycleState.Error,
    BrainLifecycleState.Archived,
  ],
  [BrainLifecycleState.Idle]: [
    BrainLifecycleState.Running,
    BrainLifecycleState.Designing,
    BrainLifecycleState.Error,
    BrainLifecycleState.Archived,
  ],
  [BrainLifecycleState.Error]: [
    BrainLifecycleState.Ready,
    BrainLifecycleState.Designing,
    BrainLifecycleState.Idle,
    BrainLifecycleState.Archived,
  ],
  [BrainLifecycleState.Archived]: [],
}

export class BrainLifecycle {
  private state: BrainLifecycleState

  constructor(initial: BrainLifecycleState = BrainLifecycleState.Created) {
    this.state = initial
  }

  get current(): BrainLifecycleState {
    return this.state
  }

  is(state: BrainLifecycleState): boolean {
    return this.state === state
  }

  canTransitionTo(next: BrainLifecycleState): boolean {
    return TRANSITIONS[this.state].includes(next)
  }

  transitionTo(next: BrainLifecycleState): void {
    if (this.state === next) return
    if (!this.canTransitionTo(next)) {
      throw new BrainTransitionError(this.state, next)
    }
    this.state = next
  }

  reset(): void {
    this.state = BrainLifecycleState.Created
  }
}
