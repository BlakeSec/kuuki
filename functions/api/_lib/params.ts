// Shared request-parameter parsers. Each throws HttpError(400) on bad input.

import { HttpError } from './http'
import { isCatalogCountry } from './regions'

/** ISO 3166-1 alpha-2 country code, uppercase only. */
export function parseCountryCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value))
    throw new HttpError(400, 'Invalid country code', 'INVALID_COUNTRY')
  return value
}

/** A well-formed code that is also in the country catalog; for writes that add a country. Deletes keep `parseCountryCode`. */
export function parseCatalogCountryCode(value: unknown): string {
  const code = parseCountryCode(value)
  if (!isCatalogCountry(code)) throw new HttpError(400, 'Unknown country code', 'INVALID_COUNTRY')
  return code
}
