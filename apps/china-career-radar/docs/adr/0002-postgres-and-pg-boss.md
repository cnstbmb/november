# Use PostgreSQL for state and pg-boss for durable work

The MVP will keep canonical data, immutable job versions, feedback, source-run statistics, and durable jobs in PostgreSQL, with pg-boss providing schedules, retries, and dead-letter handling. This deliberately avoids a second operational datastore such as Redis while preserving transactional handoff between persisted domain state and asynchronous work.
