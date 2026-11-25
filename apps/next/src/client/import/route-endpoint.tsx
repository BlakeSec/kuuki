import type { Draft } from './import-types'
import type { Endpoint } from './questions'

export const MISSING_ENDPOINT = '—'

export const endpointText = (draft: Draft, endpoint: Endpoint) =>
  draft.fields[endpoint] || draft.fields[`${endpoint}_hint`] || MISSING_ENDPOINT

export const routeText = (draft: Draft) =>
  `${endpointText(draft, 'origin')} → ${endpointText(draft, 'destination')}`

export function RouteEndpoint({ draft, endpoint }: { draft: Draft; endpoint: Endpoint }) {
  return (
    <span className={draft.fields[endpoint] ? 'import-code' : undefined}>
      {endpointText(draft, endpoint)}
    </span>
  )
}
