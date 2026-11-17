// Timezone-aware flight duration + UTC timestamps — ported from the live PL/pgSQL.
// Source of truth: supabase/migrations/20260212120000_fix_timezone_aware_duration.sql
// (a one-time UPDATE; there is NO deployed trigger/function re-running this logic — verified
//  against live pg_proc on 2026-06-20, only unrelated compute_duration_* aggregations exist).
//
// The migration converts local wall-clock times to UTC with Postgres `(date + time) AT TIME ZONE tz`
// then derives duration. We replicate `AT TIME ZONE` semantics with Intl (see localWallClockToUtc).
//
// Parity quirks (do NOT "fix"):
//   * `departure_utc` is set UNCONDITIONALLY from the same-day departure.
//   * Missing time or tz → row is excluded by the WHERE clause → leave everything unchanged
//     (departureUtc/arrivalUtc null, durationMinutes = existing).
//
// Deliberate departure from the migration: the arrival is the candidate date from −1 to +2 days
// whose duration falls in (0, 1440], taking the smallest such duration. With no candidate the
// arrival is unknown (null) and the existing duration is kept. This replaces the legacy arrival
// CASE, which stamped inverted or day-shifted arrivals across the date line; ADR 0002 (the server
// is the authority) justifies it now that the legacy backfill is done.

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000
/** Arrival dates tried, relative to the departure date: date-line eastbound (−1) to westbound trans-Pacific (+2). */
const ARRIVAL_DAY_OFFSETS = [-1, 0, 1, 2] as const
/** The plausible window for an inferred block time, in minutes (legacy bound; decideDuration clamps to 1200 later). */
const MAX_INFERRED_MINUTES = 1440

/**
 * Replicate Postgres `(timestamp without time zone) AT TIME ZONE tz` → `timestamptz`.
 *
 * Given a wall-clock instant (Y-M-D H:M:S) understood to be local to `tz`, return the UTC `Date`.
 * Intl only goes UTC→local, so we invert: pretend the wall-clock parts are UTC, ask Intl what local
 * time that UTC instant maps to in `tz`, and the difference is the zone's offset. A second pass
 * pins down DST-transition days where the offset at the guessed instant differs from the offset at
 * the corrected instant (matches PG's deterministic resolution of normal times).
 */
function localWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  let utc = asUtc - tzOffsetMs(asUtc, timeZone)
  // Refine once: the offset may differ at the corrected instant (DST boundary).
  utc = asUtc - tzOffsetMs(utc, timeZone)
  return new Date(utc)
}

/** Offset of `tz` from UTC, in ms (local = utc + offset), at the instant `utcMs`. */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return asIfUtc - utcMs
}

/** Parse 'YYYY-MM-DD' (ignoring any trailing time) into [year, month, day]. */
function parseDate(date: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Parse 'HH:MM' or 'HH:MM:SS' local time into [hour, minute, second]. */
function parseTime(time: string): [number, number, number] | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(time)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 0]
}

export interface ComputeFlightDurationInput {
  date: string
  departureTime: string | null
  arrivalTime: string | null
  originTz: string | null
  destTz: string | null
  existingDurationMinutes: number | null
}

export interface ComputeFlightDurationResult {
  departureUtc: string | null
  arrivalUtc: string | null
  durationMinutes: number | null
}

/**
 * Compute departure_utc, arrival_utc and duration_minutes for a flight.
 *
 * Pure (no D1) — origin_tz/dest_tz are already on the flight row (airport tz lookup happens at
 * enrichment/import time, not here). Mirrors the migration's WHERE; the arrival day is searched, not copied from its CASE. Never throws.
 */
export function computeFlightDuration(
  input: ComputeFlightDurationInput,
): ComputeFlightDurationResult {
  const { date, departureTime, arrivalTime, originTz, destTz, existingDurationMinutes } = input

  // WHERE departure_time IS NOT NULL AND arrival_time IS NOT NULL AND origin_tz IS NOT NULL AND dest_tz IS NOT NULL
  if (!date || !departureTime || !arrivalTime || !originTz || !destTz) {
    return { departureUtc: null, arrivalUtc: null, durationMinutes: existingDurationMinutes }
  }

  const d = parseDate(date)
  const dep = parseTime(departureTime)
  const arr = parseTime(arrivalTime)
  if (!d || !dep || !arr) {
    return { departureUtc: null, arrivalUtc: null, durationMinutes: existingDurationMinutes }
  }
  const [y, mo, day] = d

  // (date + departure_time) AT TIME ZONE origin_tz   — used everywhere; departure_utc set unconditionally.
  const depUtc = localWallClockToUtc(y, mo, day, dep[0], dep[1], dep[2], originTz)
  if (Number.isNaN(depUtc.getTime())) {
    return { departureUtc: null, arrivalUtc: null, durationMinutes: existingDurationMinutes }
  }

  let best: { arrival: Date; minutes: number } | null = null
  for (const offset of ARRIVAL_DAY_OFFSETS) {
    // Shift the DATE first so DST is evaluated at that date's wall clock, as before.
    const arrivalDate = new Date(Date.UTC(y, mo - 1, day) + offset * MS_PER_DAY)
    const arrival = localWallClockToUtc(
      arrivalDate.getUTCFullYear(),
      arrivalDate.getUTCMonth() + 1,
      arrivalDate.getUTCDate(),
      arr[0],
      arr[1],
      arr[2],
      destTz,
    )
    if (Number.isNaN(arrival.getTime())) {
      return { departureUtc: null, arrivalUtc: null, durationMinutes: existingDurationMinutes }
    }
    const minutes = (arrival.getTime() - depUtc.getTime()) / MS_PER_MINUTE
    if (
      minutes > 0 &&
      minutes <= MAX_INFERRED_MINUTES &&
      (best === null || minutes < best.minutes)
    ) {
      best = { arrival, minutes }
    }
  }

  return {
    departureUtc: depUtc.toISOString(),
    // No plausible candidate: an unknown arrival, never an inverted or day-shifted pair.
    arrivalUtc: best ? best.arrival.toISOString() : null,
    durationMinutes: best ? pgRound(best.minutes) : existingDurationMinutes,
  }
}

/**
 * Postgres ROUND() on a value that is here always integral (UTC second-precision diff over 60).
 * Use round-half-away-from-zero to match PG's numeric ROUND, though inputs are integers in practice.
 */
function pgRound(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value))
}
