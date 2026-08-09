# PMV CRM Records + Communications Expansion

## Product direction

PMV HQ should treat people and businesses as durable CRM records. Pipeline stage is a property of a record, not the record itself. Lists/segments are audiences or working views over records. Communications should be sendable from the record profile or the Communications Center and every send should appear on the record timeline.

## Phase 1 scope

1. Upgrade `contact_inquiries` from a flat inquiry row into a first-class lead/prospect record while preserving the existing conversion path.
2. Support person and business records.
3. Add lead profile pages with overview, contact/company information, activity timeline, internal notes, communication history, list membership, lifecycle/stage, and conversion.
4. Add CSV import for leads/prospects with duplicate-safe upsert rules and import history.
5. Add static CRM lists and dynamic saved segments.
6. Expand Communications Center audiences to clients, leads/prospects, employees, vendors, lists, and explicit records.
7. Add email eligibility/suppression on CRM records and never send marketing messages to a suppressed record.
8. Log campaign sends against lead/client records so history survives lead-to-client conversion.
9. Redesign client profiles around a modern record header + action bar + timeline/workspace tabs instead of a dense card grid.

## Modern CRM patterns used

- Record header: identity, lifecycle/stage, owner, primary contact methods, key tags.
- Primary actions beside the identity: Email, Message, Add note, Add task, Convert (lead only).
- Tabs: Overview / Activity / Work / Documents / Billing / Applications / Details.
- Overview is summary-first. Detailed tables live in focused tabs rather than all being visible at once.
- Activity is chronological and combines communications, notes, changes, appointments, and key workflow events.
- People and companies can be imported, filtered, added to lists, selected in bulk, and used as communication audiences.

## Data model principle

Keep `contact_inquiries` as the durable pre-client CRM record to preserve public form ingestion and lead conversion. Extend it instead of introducing a parallel lead table. Converted records remain available as historical lead records linked to their resulting client.
