/// <reference lib="webworker" />
import type { FeedforwardResult } from '../core/feedforward'
import { runRobustness, type RobustRanges, type RobustResult } from '../core/physics/robustness'
import { simulate, type SimInput, type SimResult } from '../core/physics/simulate'
import type { ElevatorMechanism } from '../schema/parameterSet'

export type SimRequest =
  | { id: number; kind: 'sim'; input: SimInput }
  | { id: number; kind: 'robust'; base: SimInput; mechanism: ElevatorMechanism; ff: FeedforwardResult; ranges: RobustRanges }

export type SimResponse =
  | { id: number; ok: true; result: SimResult }
  | { id: number; ok: true; robust: RobustResult }
  | { id: number; ok: false; error: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope

const buffers = (r: SimResult) =>
  Object.values(r)
    .filter((v): v is Float64Array => v instanceof Float64Array)
    .map((a) => a.buffer)

ctx.onmessage = (ev: MessageEvent<SimRequest>) => {
  const req = ev.data
  try {
    if (req.kind === 'robust') {
      const robust = runRobustness(req.base, req.mechanism, req.ff, req.ranges)
      ctx.postMessage({ id: req.id, ok: true, robust } satisfies SimResponse, buffers(robust.worst))
    } else {
      const result = simulate(req.input)
      ctx.postMessage({ id: req.id, ok: true, result } satisfies SimResponse, buffers(result))
    }
  } catch (e) {
    ctx.postMessage({ id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) } satisfies SimResponse)
  }
}
