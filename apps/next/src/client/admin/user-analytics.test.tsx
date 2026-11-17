// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UserAnalyticsData } from '../../../../../functions/api/_services/userAnalytics'
import { UserAnalytics } from './user-analytics'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const data = (maintenance: UserAnalyticsData['maintenance']): UserAnalyticsData => ({
  days: 7,
  asOf: '2026-10-28T12:00:00.000Z',
  startDate: '2026-10-22',
  activity: { since: null, daily: 0, weekly: 0, monthly: 0 },
  maintenance,
  totals: {
    users: 0,
    onboarded: 0,
    withEntries: 0,
    publicProfiles: 0,
    flights: 0,
    railJourneys: 0,
    roadTrips: 0,
    importUsers: 0,
  },
  period: { newUsers: 0, previousNewUsers: 0, contributors: 0, flightsAdded: 0, groundAdded: 0 },
  daily: [],
})

const failed = {
  lastSuccessAt: '2026-10-28T10:00:00.000Z',
  lastFailureAt: '2026-10-28T11:00:00.000Z',
  lastError: 'MAINTENANCE_CYCLE_FAILED',
}

describe('UserAnalytics maintenance panel', () => {
  it('shows dashes when maintenance has not run', () => {
    render(
      <UserAnalytics
        data={data({ lastSuccessAt: null, lastFailureAt: null, lastError: null })}
        locale="en"
      />,
    )
    const region = screen.getByRole('region', { name: 'Maintenance' })
    expect(within(region).getAllByText('—')).toHaveLength(3)
    expect(within(region).queryByText('MAINTENANCE_CYCLE_FAILED')).toBeNull()
  })

  it('shows the last failure and its code', () => {
    render(<UserAnalytics data={data(failed)} locale="en" />)
    const region = screen.getByRole('region', { name: 'Maintenance' })
    expect(within(region).getByText('MAINTENANCE_CYCLE_FAILED')).toBeTruthy()
    const times = Array.from(region.querySelectorAll('time')).map((time) =>
      time.getAttribute('datetime'),
    )
    expect(times).toEqual(['2026-10-28T10:00:00.000Z', '2026-10-28T11:00:00.000Z'])
  })

  it('uses Russian labels', () => {
    render(<UserAnalytics data={data(failed)} locale="ru" />)
    const region = screen.getByRole('region', { name: 'Обслуживание' })
    expect(within(region).getByText('Код ошибки')).toBeTruthy()
  })
})
