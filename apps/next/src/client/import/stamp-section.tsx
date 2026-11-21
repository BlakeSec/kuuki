'use client'

import { formatNumber, type Locale } from '../../lib/format'
import { Stamp } from '../signature/stamp'
import { catalogCountry } from '../passport/model'
import { S } from './copy'

export interface NewStamp {
  code: string
  name: string
  firstYear?: number
  eventId: string
}

export const MAX_STAMPS = 8

export function StampSection({
  locale,
  publication,
  stamps,
  theme,
  hero,
}: {
  locale: Locale
  publication: 'idle' | 'ready' | 'pending' | 'delayed'
  stamps: NewStamp[]
  theme?: 'light' | 'dark'
  hero: boolean
}) {
  const shown = stamps.slice(0, MAX_STAMPS)
  const shortNames = new Intl.DisplayNames([locale], { type: 'region', style: 'short' })
  const shortName = ({ code, name }: NewStamp) => {
    const short = name.length > 14 ? shortNames.of(code) : undefined
    return short && short.length < name.length ? short : name
  }
  return (
    <>
      {publication === 'pending' ? (
        <p className="import-hint" role="status">
          {S.stampsWaiting[locale]}
        </p>
      ) : null}
      {publication === 'delayed' ? (
        <p className="import-hint" role="status">
          {S.stampsDelayed[locale]}
        </p>
      ) : null}

      {shown.length > 0 ? (
        <div className="import-stamps">
          <h3>
            {S.newCountries[locale]}
            {stamps.length > shown.length ? (
              <span className="import-stamps-count"> · {formatNumber(locale, stamps.length)}</span>
            ) : null}
          </h3>
          <ul className="import-stamp-grid">
            {shown.map((stamp) => {
              const country = catalogCountry(stamp.code)
              return (
                <li key={stamp.code}>
                  <Stamp
                    countryCode={stamp.code}
                    nativeName={country?.nativeName ?? shortName(stamp)}
                    name={shortName(stamp)}
                    firstYear={stamp.firstYear}
                    color={country?.dominantColor ?? null}
                    kind="air"
                    theme={theme}
                    locale={locale}
                    pressEventId={stamp.eventId}
                    heroExitKey={hero ? stamp.code : undefined}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </>
  )
}
