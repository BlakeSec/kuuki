import { expect, it } from 'vitest'
import { NOMADS_MAX_ROUTES, nomadsSummaryOf, nomadsToText } from './nomads-json'
import { nomadsLeftOut, nomadsStory } from './nomads-note'
import { parseStructuredText } from '../../../../../functions/api/import/_text'
import { rowOf } from '../../../../../functions/api/_services/importJob'
import { normalizeFlights } from '../../../../../functions/api/import/_extract'

const stay = (place: string, start: string, end = start, country_code = 'US') => ({
  place,
  country_code,
  date_start: start,
  date_end: end,
})
const exportOf = (trips: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ ...extra, trips })
const rows = (content: string) =>
  parseStructuredText(content)!.flights.map((flight) => rowOf(flight))

it('resolves airports by city and country, strips profile data and leaves every draft unselected', () => {
  const result = nomadsToText(
    exportOf([stay('Boston', '2026-03-12'), stay('New York', '2026-03-01', '2026-03-10')], {
      username: 'private-user',
      photo: 'private-photo',
    }),
  )
  expect(result.content).not.toContain('private')
  const [row] = rows(result.content)
  expect(row).toMatchObject({
    selected: false,
    fields: { date: '2026-03-12', origin: '', destination: 'BOS', review_required: true },
  })
  expect(row.fields.origin_options).toEqual(expect.arrayContaining(['JFK', 'LGA']))
  expect(result.summary).toMatchObject({ stays: 2, countries: 1, routes: 1 })
})

it('keeps a city without an airport as a hint to choose from', () => {
  const result = nomadsToText(
    exportOf([
      stay('Bangkok', '2026-01-01', '2026-01-09', 'TH'),
      stay('Canggu', '2026-01-10', '2026-01-20', 'ID'),
    ]),
  )
  expect(rows(result.content)[0].fields).toMatchObject({
    origin: '',
    destination: '',
    destination_hint: 'Canggu, ID',
  })
})

it('leaves out hops short enough to travel by land and says so', () => {
  const result = nomadsToText(
    exportOf([
      stay('Rome', '2026-04-01', '2026-04-05', 'IT'),
      stay('Naples', '2026-04-06', '2026-04-08', 'IT'),
      stay('Lisbon', '2026-04-09', '2026-04-12', 'PT'),
      stay('Porto', '2026-04-13', '2026-04-15', 'PT'),
    ]),
  )
  expect(result.summary).toMatchObject({ routes: 2, ground: 1 })
  expect(result.content).not.toContain('Rome, IT → Naples, IT')
  expect(result.content).toContain('Lisbon, PT → Porto, PT')
  expect(nomadsLeftOut('en', result.summary)).toBe('Left out: 1 hop under 250 km')
})

it('merges repeated stays, leaves overlaps undated and skips moves with an unclear order', () => {
  const result = nomadsToText(
    exportOf([
      stay('New York', '2026-01-01', '2026-01-05'),
      stay('New York', '2026-01-06', '2026-01-20'),
      stay('Boston', '2026-01-10', '2026-01-11'),
      stay('Chicago', '2026-01-15'),
      stay('Seattle', '2026-01-15'),
    ]),
  )
  expect(result.summary).toMatchObject({ routes: 1, unclear: 2, ground: 0 })
  const normalized = normalizeFlights(parseStructuredText(result.content)!)
  expect(normalized.flights).toHaveLength(1)
  expect(normalized.flights[0].date).toBe('')
  expect(rowOf(normalized.flights[0]).selected).toBe(false)
})

it('skips unreadable stays one by one instead of refusing the export', () => {
  const result = nomadsToText(
    exportOf([
      stay('Boston', '2026-02-30'),
      stay('Boston | BA123', '2026-01-01'),
      { ...stay('Chicago', '2026-01-03'), country_code: null },
      stay('Boston', '2026-01-02'),
    ]),
  )
  expect(result.summary).toMatchObject({ stays: 2, invalid: 2, routes: 1 })
  expect(result.content).toContain('Boston, US → Chicago')
})

it('refuses files that are not a Nomads trips export', () => {
  for (const input of [
    '{}',
    '{',
    exportOf([stay('Boston', '2026-02-30')]),
    exportOf(Array(10_001).fill(1)),
  ])
    expect(() => nomadsToText(input)).toThrow()
})

it('keeps the newest routes when an export has more than one batch can hold', () => {
  const day = (offset: number) => new Date(Date.UTC(2020, 0, 1 + offset)).toISOString().slice(0, 10)
  const trips = Array.from({ length: NOMADS_MAX_ROUTES + 3 }, (_, index) =>
    index % 2
      ? stay('Bangkok', day(index * 2), day(index * 2), 'TH')
      : stay('Lisbon', day(index * 2), day(index * 2), 'PT'),
  )
  const result = nomadsToText(exportOf(trips))
  expect(result.summary).toMatchObject({ routes: NOMADS_MAX_ROUTES, older: 2 })
  expect(result.content.split('\n').at(-1)).toContain(day((NOMADS_MAX_ROUTES + 2) * 2))
})

it('does not invent flights for an empty export or a single stay', () => {
  expect(nomadsToText(exportOf([])).content).toBe('')
  expect(nomadsToText(exportOf([stay('Boston', '2026-01-01')])).content).toBe('')
})

it('tells the story in real Russian plural forms', () => {
  const summary = {
    stays: 21,
    countries: 3,
    routes: 5,
    ground: 2,
    unclear: 0,
    invalid: 1,
    older: 0,
  }
  expect(nomadsStory('ru', summary)).toBe('21 пребывание в 3 странах · 5 возможных перелётов')
  expect(nomadsStory('en', { ...summary, stays: 1, countries: 1, routes: 1 })).toBe(
    '1 stay in 1 country · 1 possible flight',
  )
  expect(nomadsLeftOut('ru', summary)).toBe(
    'Не вошли: 2 переезда короче 250 км, 1 нечитаемое пребывание',
  )
})

it('restores only a well-formed summary from session storage', () => {
  const summary = { stays: 2, countries: 1, routes: 1, ground: 0, unclear: 0, invalid: 0, older: 0 }
  expect(nomadsSummaryOf({ ...summary, extra: 'x' })).toEqual(summary)
  expect(nomadsSummaryOf({ skipped: 1 })).toBeUndefined()
  expect(nomadsSummaryOf({ ...summary, routes: -1 })).toBeUndefined()
})

it('still rejects undated empty routes without distinct city hints and an explicit review marker', () => {
  const flight = {
    date: '',
    origin: '',
    destination: '',
    airline_iata: 'ZZ',
    confidence: 0.5,
    origin_hint: 'Boston',
    destination_hint: 'Chicago',
    review_required: true,
  }
  for (const change of [
    { review_required: false },
    { destination_hint: 'Boston' },
    { destination_hint: '' },
  ])
    expect(() => normalizeFlights({ flights: [{ ...flight, ...change }] })).toThrow()
})
