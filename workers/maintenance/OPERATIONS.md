The scheduled worker runs hourly after checking `MAINTENANCE_MODE`.
Deploy it only after the legacy evidence import and initial derived repair are verified.
It needs D1 only; do not add `AUTH_SECRET` or sender credentials.

Operator health query (investigate when `needs_attention = 1`):

```sql
SELECT last_success_at, last_failure_at, last_error,
       CASE WHEN last_success_at IS NULL
              OR (julianday('now') - julianday(last_success_at)) * 1440 > 75
            THEN 1 ELSE 0 END AS needs_attention,
       CAST((julianday('now') - julianday(last_success_at)) * 1440 AS INTEGER)
         AS minutes_since_success
FROM maintenance_status WHERE id = 1;
```

Pending users:

```sql
SELECT user_id, revision, published_revision, last_error, updated_at
FROM user_derived_state
WHERE revision != published_revision
ORDER BY updated_at;
```

Leaderboard failures: cleanup still runs after a failed leaderboard refresh, and the cycle then records `MAINTENANCE_CYCLE_FAILED`.

Skipped legacy evidence (log event `legacy_evidence_skipped`). Lists candidates: a row without a country whose airport also appears in the user's flights is used, not skipped.

```sql
SELECT e.source_id, e.user_id, e.airport_iata, e.country_code
FROM legacy_visit_evidence e
LEFT JOIN airports_reference ar ON ar.iata = e.airport_iata
WHERE e.contributes = 1
  AND (e.airport_iata IS NULL OR COALESCE(e.country_code, ar.country_code) IS NULL);
```
