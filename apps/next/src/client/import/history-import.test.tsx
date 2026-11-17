// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { HistoryPage, HistoryRunSummary } from '@kuuki/shared/flightyHistory'
import { HistoryImport } from './history-import'
import { HistorySession, type HistoryTransport } from './history-session'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}))

const ZERO_STATES = {
  ready: 0,
  needs_review: 0,
  error: 0,
  created: 0,
  duplicate: 0,
  preserved_only: 0,
  ignored: 0,
  removed: 0,
}

function runOf(
  over: Partial<Omit<HistoryRunSummary, 'totals'>> & {
    totals?: { states?: Partial<typeof ZERO_STATES> }
  } = {},
): HistoryRunSummary {
  const { totals, ...rest } = over
  return {
    id: 'run-1',
    status: 'review',
    profile: 'flighty-observed-33/v1',
    createdAt: '2026-11-01T00:00:00.000Z',
    expiresAt: '2026-12-01T00:00:00.000Z',
    sourceErased: false,
    revision: 1,
    generation: 1,
    headers: [],
    unknownHeaders: [],
    chunks: { total: 1, missing: [] },
    groups: [],
    totals: {
      records: 3,
      received: 3,
      blankLines: 0,
      states: { ...ZERO_STATES, ...totals?.states },
    },
    ...rest,
  }
}

const CANCELED_START = () =>
  runOf({
    totals: { states: { ready: 2, needs_review: 1 } },
    groups: [{ group: 'canceled:', code: 'UNKNOWN_CANCELED', token: '', candidates: [], rows: 1 }],
  })

const CANCELED_QUESTION = 'Were flights with an empty cancellation field flown?'

function fakeServer(start: HistoryRunSummary) {
  let run = start
  const calls: string[] = []
  const transport = {
    readPage: vi.fn(async (_id: string, query: { state?: string } = {}) => {
      calls.push(`read:${query.state ?? 'review'}`)
      const rows =
        query.state === 'ready' && run.status === 'review'
          ? Array.from({ length: run.totals.states.ready }, (_, i) => ({
              id: `r${i + 1}`,
              version: 1,
              projection: {},
            }))
          : []
      return { run, rows, nextCursor: null } as unknown as HistoryPage
    }),
    answerGroup: vi.fn(async () => {
      calls.push('group')
      const moved = run.groups[0]?.rows ?? 0
      run = {
        ...run,
        groups: [],
        revision: run.revision + 1,
        totals: {
          ...run.totals,
          states: {
            ...run.totals.states,
            needs_review: run.totals.states.needs_review - moved,
            ready: run.totals.states.ready + moved,
          },
        },
      }
      return { updated: 1 }
    }),
    confirm: vi.fn(async (_id: string, items: { rowId: string }[]) => {
      calls.push('confirm')
      const results = items.map((item) => ({
        rowId: item.rowId,
        key: 'k',
        status: 'created' as const,
        state: 'created' as const,
        flightId: `f-${item.rowId}`,
      }))
      run = {
        ...run,
        status: 'completed',
        totals: {
          ...run.totals,
          states: {
            ...run.totals.states,
            ready: 0,
            created: run.totals.states.created + items.length,
          },
        },
      }
      return { results, run, derived_state: 'ready' as const, revision: 2 }
    }),
    discard: vi.fn(async () => {
      calls.push('discard')
      run = { ...run, status: 'closed' }
      return { deleted: true }
    }),
    pressedCountries: vi.fn(async () => new Set<string>()),
    awaitPublication: vi.fn(async () => 'ready' as const),
    createRun: vi.fn(async () => {
      throw new Error('not used')
    }),
    putChunk: vi.fn(async () => {
      throw new Error('not used')
    }),
    patchRow: vi.fn(async () => {
      throw new Error('not used')
    }),
    erase: vi.fn(async () => {
      throw new Error('not used')
    }),
  }
  return { transport, calls }
}

async function renderAt(start: HistoryRunSummary, onClose = vi.fn()) {
  const server = fakeServer(start)
  const session = new HistorySession(
    () => {},
    () => null,
    server.transport as unknown as HistoryTransport,
  )
  render(<HistoryImport session={session} locale="en" onClose={onClose} />)
  await act(async () => {
    await session.resume(start.id)
  })
  return { session, onClose, ...server }
}

const saveButton = () => document.querySelector<HTMLButtonElement>('[data-history-save]')

it('answering the only question enables Save, and Save shows the finished count', async () => {
  const user = userEvent.setup()
  const { calls } = await renderAt(CANCELED_START())
  const card = screen.getByRole('group', { name: CANCELED_QUESTION })
  await user.click(within(card).getByRole('button', { name: 'Flown' }))
  expect(calls).toContain('group')
  expect(await screen.findByRole('button', { name: 'Save 3 records' })).toBeEnabled()
  await waitFor(() => expect(screen.queryByRole('group', { name: CANCELED_QUESTION })).toBeNull())
  await user.click(screen.getByRole('button', { name: 'Save 3 records' }))
  expect(calls).toContain('confirm')
  expect(await screen.findByText('flights added')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open journal' })).toHaveAttribute('href', '/journal')
})

it('Save stays disabled while an answer is on its way', async () => {
  const user = userEvent.setup()
  const { transport } = await renderAt(CANCELED_START())
  const original = transport.answerGroup.getMockImplementation()!
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  transport.answerGroup.mockImplementation(async () => {
    await gate
    return original()
  })
  const card = screen.getByRole('group', { name: CANCELED_QUESTION })
  await user.click(within(card).getByRole('button', { name: 'Flown' }))
  expect(saveButton()).toHaveAttribute('aria-disabled', 'true')
  await act(async () => {
    release()
    await gate
  })
  await waitFor(() => expect(saveButton()).not.toHaveAttribute('aria-disabled', 'true'))
  expect(saveButton()).toHaveTextContent('Save 3 records')
})

it('a lost connection shows Try again, and Try again reads the run again', async () => {
  const user = userEvent.setup()
  const { transport, calls } = await renderAt(CANCELED_START())
  transport.answerGroup.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  const card = screen.getByRole('group', { name: CANCELED_QUESTION })
  await user.click(within(card).getByRole('button', { name: 'Flown' }))
  expect(await screen.findByText('No connection. Nothing was lost.')).toBeInTheDocument()
  const reads = calls.filter((call) => call === 'read:review').length
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(screen.queryByText('No connection. Nothing was lost.')).toBeNull())
  expect(calls.filter((call) => call === 'read:review').length).toBe(reads + 1)
})

it('a run still receiving asks for its file and offers no Save', async () => {
  await renderAt(runOf({ status: 'receiving', chunks: { total: 2, missing: [1] } }))
  expect(screen.getByRole('button', { name: 'Choose the file' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull()
})

it('Discard asks for confirmation, then discards and closes', async () => {
  const user = userEvent.setup()
  const { calls, onClose } = await renderAt(runOf({ totals: { states: { ready: 1 } } }))
  await user.click(screen.getByRole('button', { name: 'Discard import' }))
  const dialog = await screen.findByRole('dialog', { name: 'Discard this import?' })
  expect(calls).not.toContain('discard')
  await user.click(within(dialog).getByRole('button', { name: 'Discard import' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  expect(calls).toContain('discard')
})

it('Close is disabled while the save runs, then calls onClose', async () => {
  const user = userEvent.setup()
  const { transport, onClose } = await renderAt(runOf({ totals: { states: { ready: 1 } } }))
  const original = transport.confirm.getMockImplementation()!
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  transport.confirm.mockImplementation(async (id, items) => {
    await gate
    return original(id, items)
  })
  await user.click(screen.getByRole('button', { name: 'Save 1 record' }))
  expect(screen.getByRole('button', { name: 'Close import' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await act(async () => {
    release()
    await gate
  })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Close import' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    ),
  )
  await user.click(screen.getByRole('button', { name: 'Close import' }))
  expect(onClose).toHaveBeenCalledTimes(1)
})
