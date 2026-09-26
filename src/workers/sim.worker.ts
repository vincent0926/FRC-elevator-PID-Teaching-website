/// <reference lib="webworker" />
import { simulate, type SimInput, type SimResult } from '../core/physics/simulate'

export interface SimRequest {
  id: number
  input: SimInput
}

export type SimResponse = { id: number; ok: true; result: SimResult } | { id: number; ok: false; error: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (ev: MessageEvent<SimRequest>) => {
  const { id, input } = ev.data
  try {
    const result = simulate(input)
    const transfer = Object.values(result)
      .filter((v): v is Float64Array => v instanceof Float64Array)
      .map((a) => a.buffer)
    ctx.postMessage({ id, ok: true, result } satisfies SimResponse, transfer)
  } catch (e) {
    ctx.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) } satisfies SimResponse)
  }
}
