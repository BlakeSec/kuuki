# ADR 0015: Nomads.com stays become possible flights for review

- **Status:** Accepted, 26 November 2026.
- **Origin:** [PR #60](https://github.com/indi256s/kuuki/pull/60), revised before merge.
- **Amends:** [ADR 0001 §6](0001-flight-lifecycle-and-import-drafts.md#6-import-drafts-migration-0007_import_draftssql) admission of undated rows without airport codes.

## Context

A Nomads.com export is a JSON list of city stays (`trips[]` with `place`, `country_code`, `date_start` and `date_end`) plus profile details. It records where the owner was, not how they moved: a change of city may be a flight, a train or a drive. The document import path already reads pipe-delimited `Undated`/ISO-date route lines deterministically, keeps drafts unselected while their status is uncertain, and lets the owner choose airports from catalog options.

## Decision

### The export is read on the device

[`nomadsToText`](../../apps/next/src/client/import/nomads-json.ts) parses the file in the browser and sends only derived route lines, one per change of city, through the existing text source. Profile details, trip IDs and the original JSON never leave the device; the source label is the file name. No provider and no AI are involved: every line is in the format the shared structured-text parser accepts, so the server admits it without Gemini.

### A change of city is only a possible flight

- Stays are ordered by start date. Consecutive stays in the same place merge into one visit and produce nothing.
- Two stays starting on the same day cannot establish direction; every move touching them is left out and counted as _unclear_.
- The flight date is the next stay's start. When the previous stay ends after that start, the overlap cannot supply a date and the line is `Undated`.
- When both cities have catalog airports and some pair lies under `LIKELY_GROUND_KM` (250 km), the move is left out as a likely journey by land and counted. Cities without catalog airports are always kept, with the city as a hint.
- A stay with a missing place, a date that is not a calendar day, an end before its start, a place over 60 characters or one containing route markup (`|`, `[`, `]`, arrows, `<`, `>`) is skipped and counted; the rest of the export still imports. The whole file is refused only when it is not JSON with a `trips` array, has no readable stay, or holds more than 10 000 stays.
- One upload produces at most `NOMADS_MAX_ROUTES` (500, the deterministic draft limit) lines; the earliest routes beyond it are left out and counted.
- Every line carries a `possible` note, so the parser marks it for review and every draft starts unselected. The summary and the reasons for anything left out are shown under the file; the rule is stated with its distance.

### City hints resolve airports

A route label `City, CC` with a catalog country code narrows [`airportCandidates`](../../functions/api/import/_text.ts) to that country: a single airport fills the code, several become `origin_options`/`destination_options`. A suffix that is not a catalog country keeps the old whole-label match. When nothing matches, the label is kept as `origin_hint`/`destination_hint` and shown in place of the code until the owner chooses an airport.

### Admission of hint-only rows (amends ADR 0001 §6)

[`normalizeFlights`](../../functions/api/import/_extract.ts) still rejects a row with no airport codes and no calendar date, unless it has two different non-empty hints and `review_required === true`. Such a row is admitted as an unselected draft. The exception applies to every source, so a model reply that names two cities and flags uncertainty is also kept for review instead of being dropped.
