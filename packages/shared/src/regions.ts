// The catalog's six collection regions (ADR 0001 §4). Policy and progress stay in functions/api/_lib/regions.ts.
import { COUNTRY_REGION, type RegionId } from './countryRegions.generated'

export type { RegionId }

export const catalogRegionOf = (code: string | null | undefined): RegionId | null =>
  code && Object.hasOwn(COUNTRY_REGION, code) ? COUNTRY_REGION[code] : null
