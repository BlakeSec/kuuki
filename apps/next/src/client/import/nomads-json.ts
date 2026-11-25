import { airportLabels } from '@kuuki/data/airport-labels'
import { findAirport } from '@kuuki/data/airport-lookup'
import { foldSearchText, isCalendarDate } from '@kuuki/shared'
import { greatCircleKm, type LatLon } from '@kuuki/shared/geo'
import type { ImportSource } from './import-api'

export const NOMADS_ACCEPT = '.json,application/json'
export const NOMADS_MAX_STAYS = 10_000
export const NOMADS_MAX_ROUTES = 500
export const LIKELY_GROUND_KM = 250
const MAX_TEXT_LENGTH = 100_000
const MAX_PLACE_LENGTH = 60
const ROUTE_NOTE = '[possible flight from Nomads stays]'

export const isNomadsFile = (file: { name: string; type: string }) =>
  /\.json$/i.test(file.name) || file.type === 'application/json'

export interface NomadsSummary {
  stays: number
  countries: number
  routes: number
  ground: number
  unclear: number
  invalid: number
  older: number
}

const SUMMARY_KEYS = [
  'stays',
  'countries',
  'routes',
  'ground',
  'unclear',
  'invalid',
  'older',
] as const satisfies readonly (keyof NomadsSummary)[]

export function nomadsSummaryOf(value: unknown): NomadsSummary | undefined {
  if (!value || typeof value !== 'object') return undefined
  const stored = value as Record<string, unknown>
  const summary = Object.fromEntries(SUMMARY_KEYS.map((key) => [key, stored[key]]))
  return SUMMARY_KEYS.every(
    (key) => Number.isSafeInteger(summary[key]) && Number(summary[key]) >= 0,
  )
    ? (summary as Record<keyof NomadsSummary, number>)
    : undefined
}

interface Stay {
  place: string
  country: string
  start: string
  end: string
}

const MARKUP = /[|[\]\r\n→➝<>]|->/

function stayOf(value: unknown): Stay | null {
  if (!value || typeof value !== 'object') return null
  const stay = value as Record<string, unknown>
  const place =
    typeof stay.place === 'string'
      ? stay.place
          .normalize('NFC')
          .replace(/[\p{Cc}\p{Cf}\s]+/gu, ' ')
          .trim()
      : ''
  const country = stay.country_code ?? ''
  if (
    !place ||
    place.length > MAX_PLACE_LENGTH ||
    MARKUP.test(place) ||
    typeof country !== 'string' ||
    !/^(?:[A-Z]{2})?$/.test(country) ||
    typeof stay.date_start !== 'string' ||
    !isCalendarDate(stay.date_start) ||
    typeof stay.date_end !== 'string' ||
    !isCalendarDate(stay.date_end) ||
    stay.date_end < stay.date_start
  )
    return null
  return { place, country, start: stay.date_start, end: stay.date_end }
}

let cityAirports: Map<string, LatLon[]> | undefined

function airportsIn(stay: Stay): LatLon[] {
  if (!cityAirports) {
    cityAirports = new Map()
    for (const label of airportLabels) {
      const airport = findAirport(label.iata)
      if (!airport) continue
      const key = `${foldSearchText(label.city)}|${airport.countryCode}`
      cityAirports.set(key, [
        ...(cityAirports.get(key) ?? []),
        { lat: airport.latitude, lon: airport.longitude },
      ])
    }
  }
  return cityAirports.get(`${foldSearchText(stay.place)}|${stay.country}`) ?? []
}

function likelyByLand(from: Stay, to: Stay): boolean {
  if (!from.country || !to.country) return false
  const origins = airportsIn(from)
  const destinations = airportsIn(to)
  return origins.some((a) => destinations.some((b) => greatCircleKm(a, b) < LIKELY_GROUND_KM))
}

const samePlace = (a: Stay, b: Stay) =>
  foldSearchText(a.place) === foldSearchText(b.place) && a.country === b.country

const label = (stay: Stay) => (stay.country ? `${stay.place}, ${stay.country}` : stay.place)

export function nomadsToText(content: string): { content: string; summary: NomadsSummary } {
  const data: unknown = JSON.parse(content.replace(/^﻿/, ''))
  if (!data || typeof data !== 'object' || !('trips' in data) || !Array.isArray(data.trips))
    throw new Error('Expected Nomads trips')
  if (data.trips.length > NOMADS_MAX_STAYS) throw new Error('Too many stays')
  const parsed = data.trips.map(stayOf)
  const stays = parsed
    .filter((stay): stay is Stay => stay !== null)
    .sort((a, b) => a.start.localeCompare(b.start))
  const summary: NomadsSummary = {
    stays: stays.length,
    countries: new Set(stays.map((stay) => stay.country).filter(Boolean)).size,
    routes: 0,
    ground: 0,
    unclear: 0,
    invalid: parsed.length - stays.length,
    older: 0,
  }
  if (data.trips.length && !stays.length) throw new Error('No readable stays')
  const tiedStarts = new Set(
    stays.filter((stay, index) => stays[index - 1]?.start === stay.start).map((stay) => stay.start),
  )
  const visits: Stay[] = []
  for (const stay of stays) {
    const last = visits.at(-1)
    if (last && samePlace(last, stay) && !tiedStarts.has(stay.start))
      visits[visits.length - 1] = { ...last, end: stay.end > last.end ? stay.end : last.end }
    else visits.push(stay)
  }
  let lines: string[] = []
  for (let index = 1; index < visits.length; index++) {
    const from = visits[index - 1],
      to = visits[index]
    if (samePlace(from, to)) continue
    if (tiedStarts.has(from.start) || tiedStarts.has(to.start)) {
      summary.unclear++
      continue
    }
    if (likelyByLand(from, to)) {
      summary.ground++
      continue
    }
    const date = from.end > to.start ? 'Undated' : to.start
    lines.push(`${date} | ${label(from)} → ${label(to)} ${ROUTE_NOTE}`)
  }
  if (lines.length > NOMADS_MAX_ROUTES) {
    summary.older = lines.length - NOMADS_MAX_ROUTES
    lines = lines.slice(-NOMADS_MAX_ROUTES)
  }
  while (lines.join('\n').length > MAX_TEXT_LENGTH) {
    lines.shift()
    summary.older++
  }
  summary.routes = lines.length
  return { content: lines.join('\n'), summary }
}

export type NomadsPreparation =
  | { kind: 'source'; source: ImportSource; summary: NomadsSummary }
  | { kind: 'empty'; summary: NomadsSummary }
  | { kind: 'failed' }

export function prepareNomads(bytes: Uint8Array, label: string): NomadsPreparation {
  try {
    const { content, summary } = nomadsToText(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    )
    return content
      ? { kind: 'source', source: { type: 'text', content, sourceLabel: label }, summary }
      : { kind: 'empty', summary }
  } catch {
    return { kind: 'failed' }
  }
}
