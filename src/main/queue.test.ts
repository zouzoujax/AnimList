import { describe, expect, it, vi } from 'vitest'
import { createQueue } from './queue'

/** No real waiting: the fake clock advances only when the queue asks it to. */
function testQueue(minGapMs = 700) {
  let clock = 0
  const queue = createQueue({
    minGapMs,
    now: () => clock,
    wait: (ms) => {
      clock += ms
      return Promise.resolve()
    }
  })
  return { queue, gaps: () => clock }
}

/** Resolves after `task` has had a chance to be picked up and settled. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

describe('lanes', () => {
  it('drains interactive before background', async () => {
    const { queue } = testQueue(0)
    const order: string[] = []
    const job = (name: string) => () => {
      order.push(name)
      return Promise.resolve(name)
    }

    const all = [
      queue.run('background', null, job('b1')),
      queue.run('background', null, job('b2')),
      queue.run('background', null, job('b3')),
      queue.run('interactive', null, job('i1'))
    ]
    await Promise.all(all)

    // b1 was already in flight when i1 arrived, so it cannot be pre-empted —
    // but i1 must overtake everything still waiting.
    expect(order[0]).toBe('b1')
    expect(order[1]).toBe('i1')
    expect(order.slice(2)).toEqual(['b2', 'b3'])
  })

  it('keeps FIFO order inside a lane', async () => {
    const { queue } = testQueue(0)
    const order: number[] = []
    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        queue.run('interactive', null, () => {
          order.push(n)
          return Promise.resolve(n)
        })
      )
    )
    expect(order).toEqual([1, 2, 3, 4])
  })
})

describe('rate limiting', () => {
  it('spaces successive jobs by the minimum gap', async () => {
    const { queue, gaps } = testQueue(700)
    await Promise.all([
      queue.run('interactive', null, () => Promise.resolve(1)),
      queue.run('interactive', null, () => Promise.resolve(2)),
      queue.run('interactive', null, () => Promise.resolve(3))
    ])
    // First job runs immediately; the next two each wait a full gap.
    expect(gaps()).toBe(1400)
  })

  it('does not wait when the queue has been idle', async () => {
    const { queue, gaps } = testQueue(700)
    await queue.run('interactive', null, () => Promise.resolve(1))
    expect(gaps()).toBe(0)
  })
})

describe('deduplication', () => {
  it('runs a shared key once and gives everyone the same result', async () => {
    const { queue } = testQueue(0)
    const task = vi.fn(() => Promise.resolve('value'))

    const [a, b, c] = await Promise.all([
      queue.run('interactive', 'same', task),
      queue.run('interactive', 'same', task),
      queue.run('background', 'same', task)
    ])

    expect(task).toHaveBeenCalledTimes(1)
    expect([a, b, c]).toEqual(['value', 'value', 'value'])
  })

  it('shares with a job that is still in flight', async () => {
    const { queue } = testQueue(0)
    // Stays pending, so the job is genuinely mid-flight when the second caller
    // arrives — a task that resolves immediately would already be done.
    let release!: (value: string) => void
    const task = vi.fn(() => new Promise<string>((resolve) => (release = resolve)))

    const first = queue.run('interactive', 'same', task)
    await settle()
    const second = queue.run('interactive', 'same', task)
    release('value')

    expect(await first).toBe('value')
    expect(await second).toBe('value')
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('does not share when no key is given', async () => {
    const { queue } = testQueue(0)
    const task = vi.fn(() => Promise.resolve('value'))
    await Promise.all([queue.run('interactive', null, task), queue.run('interactive', null, task)])
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('lets a key be requested again once it has finished', async () => {
    const { queue } = testQueue(0)
    const task = vi.fn(() => Promise.resolve('value'))
    await queue.run('interactive', 'same', task)
    await queue.run('interactive', 'same', task)
    expect(task).toHaveBeenCalledTimes(2)
  })
})

describe('promotion', () => {
  it('moves a queued background job into the interactive lane', async () => {
    const { queue } = testQueue(0)
    const order: string[] = []
    const job = (name: string) => () => {
      order.push(name)
      return Promise.resolve(name)
    }

    const blocker = queue.run('background', null, job('blocker'))
    const shared = queue.run('background', 'shared', job('shared'))
    const filler = queue.run('background', null, job('filler'))
    // Same key, but now something interactive needs it.
    const promoted = queue.run('interactive', 'shared', job('shared'))

    await Promise.all([blocker, shared, filler, promoted])

    expect(await promoted).toBe('shared')
    // "shared" jumped ahead of "filler" even though it was queued first as background.
    expect(order).toEqual(['blocker', 'shared', 'filler'])
  })
})

describe('errors', () => {
  it('rejects only the failing job and keeps draining', async () => {
    const { queue } = testQueue(0)
    const failure = queue.run('interactive', null, () => Promise.reject(new Error('boom')))
    const after = queue.run('interactive', null, () => Promise.resolve('ok'))

    await expect(failure).rejects.toThrow('boom')
    expect(await after).toBe('ok')
  })

  it('releases a failed key so it can be retried', async () => {
    const { queue } = testQueue(0)
    const task = vi.fn(() => Promise.reject(new Error('boom')))
    await expect(queue.run('interactive', 'k', task)).rejects.toThrow('boom')
    await expect(queue.run('interactive', 'k', task)).rejects.toThrow('boom')
    expect(task).toHaveBeenCalledTimes(2)
  })
})

describe('stats', () => {
  it('reports an empty queue once everything has settled', async () => {
    const { queue } = testQueue(0)
    await Promise.all([
      queue.run('interactive', null, () => Promise.resolve(1)),
      queue.run('background', null, () => Promise.resolve(2))
    ])
    expect(queue.stats()).toEqual({ interactive: 0, background: 0, active: 0 })
  })
})
