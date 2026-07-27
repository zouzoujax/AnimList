/**
 * Rate-limited request scheduler with two priority lanes.
 *
 * AniList allows roughly 30 requests a minute, so calls have to be serialised
 * with a gap between them. A plain FIFO makes background bulk work (a whole-week
 * calendar, a franchise sweep) delay whatever the user is waiting for, so jobs
 * declare a lane and the interactive one is always drained first.
 *
 * `now` and `wait` are injectable so the ordering can be tested without sleeping.
 */

export type Lane = 'interactive' | 'background'

export interface QueueOptions {
  minGapMs: number
  now?: () => number
  wait?: (ms: number) => Promise<void>
}

interface Job {
  key: string | null
  lane: Lane
  task: () => Promise<unknown>
  promise: Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

export interface RequestQueue {
  /**
   * Runs `task` when its turn comes. A non-null `key` enables sharing: an
   * identical job that is queued or in flight is reused rather than repeated.
   */
  run: <T>(lane: Lane, key: string | null, task: () => Promise<T>) => Promise<T>
  stats: () => { interactive: number; background: number; active: number }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export function createQueue({ minGapMs, now = Date.now, wait = sleep }: QueueOptions): RequestQueue {
  const lanes: Record<Lane, Job[]> = { interactive: [], background: [] }
  /** Queued but not started — still re-orderable. */
  const pending = new Map<string, Job>()
  /** Started; the only thing left to do is share the result. */
  const active = new Map<string, Promise<unknown>>()

  let draining = false
  let lastStart = Number.NEGATIVE_INFINITY

  async function drain(): Promise<void> {
    if (draining) return
    draining = true
    try {
      for (;;) {
        const job = lanes.interactive.shift() ?? lanes.background.shift()
        if (!job) break
        if (job.key) pending.delete(job.key)

        const gap = now() - lastStart
        if (gap < minGapMs) await wait(minGapMs - gap)
        lastStart = now()

        const running = job.task()
        if (job.key) active.set(job.key, running)
        try {
          job.resolve(await running)
        } catch (error) {
          job.reject(error)
        } finally {
          if (job.key) active.delete(job.key)
        }
      }
    } finally {
      draining = false
    }
  }

  return {
    run<T>(lane: Lane, key: string | null, task: () => Promise<T>): Promise<T> {
      if (key) {
        const inFlight = active.get(key)
        if (inFlight) return inFlight as Promise<T>

        const queued = pending.get(key)
        if (queued) {
          // Someone urgent now wants what was only a background nicety.
          if (lane === 'interactive' && queued.lane === 'background') {
            const index = lanes.background.indexOf(queued)
            if (index >= 0) lanes.background.splice(index, 1)
            queued.lane = 'interactive'
            lanes.interactive.push(queued)
          }
          return queued.promise as Promise<T>
        }
      }

      let resolve!: (value: unknown) => void
      let reject!: (reason: unknown) => void
      const promise = new Promise<T>((res, rej) => {
        resolve = res as (value: unknown) => void
        reject = rej
      })

      const job: Job = { key, lane, task, promise, resolve, reject }
      lanes[lane].push(job)
      if (key) pending.set(key, job)
      void drain()
      return promise
    },

    stats: () => ({
      interactive: lanes.interactive.length,
      background: lanes.background.length,
      active: active.size
    })
  }
}
