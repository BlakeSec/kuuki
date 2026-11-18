import { expect, it } from 'vitest'
import { nomadsToText } from './nomads-json'
import { parseStructuredText } from '../../../../../functions/api/import/_text'
import { rowOf } from '../../../../../functions/api/_services/importJob'

const stay = (place: string, start: string, end = start) => ({
  place,
  country_code: 'US',
  date_start: start,
  date_end: end,
})
it('sorts stays, strips private profile data and keeps drafts unselected with city hints', () => {
  const result = nomadsToText(
    JSON.stringify({
      username: 'private-user',
      photo: 'private-photo',
      trips: [stay('Boston', '2026-03-12'), stay('New York', '2026-03-01', '2026-03-10')],
    }),
  )
  expect(result.content).not.toContain('private')
  const flights = parseStructuredText(result.content)!.flights
  expect(flights).toHaveLength(1)
  expect(rowOf(flights[0])).toMatchObject({
    selected: false,
    fields: {
      date: '2026-03-12',
      origin: '',
      destination: '',
      airline_iata: 'ZZ',
      origin_hint: 'New York, US',
      destination_hint: 'Boston, US',
      review_required: true,
    },
  })
})
it('leaves overlapping dates unknown and skips repeated or ambiguously ordered stays', () => {
  const result = nomadsToText(
    JSON.stringify({
      trips: [
        stay('New York', '2026-01-01', '2026-01-20'),
        stay('Boston', '2026-01-10'),
        stay('Boston', '2026-01-12'),
        stay('Chicago', '2026-01-12'),
      ],
    }),
  )
  expect(result.skipped).toBe(2)
  expect(parseStructuredText(result.content)!.flights[0].date).toBe('')
})
it('retains unknown countries and rejects invalid dates, oversized exports and list injection', () => {
  const result = nomadsToText(
    JSON.stringify({
      trips: [
        { ...stay('Unknown place', '2026-01-01'), country_code: '' },
        stay('Boston', '2026-01-02'),
      ],
    }),
  )
  expect(result.content).toContain('Unknown place, ?')
  for (const input of [
    '{}',
    '{',
    JSON.stringify({ trips: [stay('Boston', '2026-02-30')] }),
    JSON.stringify({ trips: [stay('Boston | BA123', '2026-01-01')] }),
    JSON.stringify({ trips: Array(502).fill(stay('Boston', '2026-01-01')) }),
  ])
    expect(() => nomadsToText(input)).toThrow()
})
it('does not invent flights for an empty export or a single stay', () => {
  expect(nomadsToText('{"trips":[]}').content).toBe('')
  expect(nomadsToText(JSON.stringify({ trips: [stay('Boston', '2026-01-01')] })).content).toBe('')
})
