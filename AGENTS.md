# AGENTS.md - Pinnacle Management Ventures

## Project Overview
- **Full-stack app**: Cloudflare Pages + Vite + React 18 + TypeScript + Hono API + D1 (SQLite)
- **Monorepo-style**: `src/` (frontend), `functions/` (API routes), `shared/` (TS utilities), `migrations/` (D1 SQL)
- **Run**: `npm install`, then `npm run dev` (Vite), `npm run typecheck`, `npm test`, `npm run build`
- **Deploy**: `npm run build && npx wrangler pages deploy dist`

## Tech Stack Conventions
- **Authorization is scoped, not hidden**: All API calls use `scopeFilter`/`loadScopedRow` — clients never see data beyond their `client_user_id`. Frontend hiding is insufficient; server-side guards are authoritative.
- **Shared types in `shared/`**: `matterWorkspace.ts` defines `MatterStatus`, `RESPONSIBILITY_STATES`, `CLIENT_STAGES`, `NextActionType`, `resolveResponsibility()`, `responsibilityBanner()`, `resolveClientStage()`, `clientStageLabel()`, `nextActionHref()`, `nextActionButtonLabel()`.
- **Database**: Matters table has `status`, `client_stage`, `responsibility_state`, `next_action_label`, `next_action_type`, `next_action_due_at`, `blocked_reason_client_safe`. Documents have `review_status` (pending|approved|rejected). Milestones have `client_visible = 1` for portal exposure.
- **API routes**: `functions/_lib/routes/portal.ts` — all portal routes use `requireUser`; staff/admin routes use `requireStaff`/`requireAdmin`. Route params `:id` are validated via `loadScopedRow` — never trust client-supplied IDs.
- **Styling**: Tailwind CSS with `bg-white/[.02]`, `border-white/[.08]`, `text-slate-200`, `text-gold` conventions. Radix UI for dialogs/alerts, `sonner` toasts.
- **Date formatting**: `formatClientWhen()` in `shared/matterworkspace.ts` — handles both ISO strings and YYYY-MM-DD; safely returns `null` for invalid dates.

## Security Model (Never Skip)
- **Client data isolation**: `visibleClientIds()`, `canAccessClient()`, `scopeFilter()`, `loadScopedRow()` — clients see ONLY their own records. Staff see clients they're assigned to. Admin sees all.
- **Never expose through Client Portal**: internal notes, internal DMs, pipeline state, staff-only comments, security events, audit events, private QA info, internal vendor discussion, admin metadata, other clients' records.
- **If client visibility cannot be determined safely from existing data, DO NOT expose the record.**
- **API routes**: `requireUser` for all portal routes. `requireStaff`/`requireAdmin` for write/admin routes. Role checks (`user.role === 'client'`) guard forbidden actions (return 403).
- **Scope errors**: Return `c.json({ error: err.message }, err.status)` via the `onError` handler.

## Pinnacle-Specific Development Rules

### Relationships (Flattening Collapses Data)
- Preserve: `Person ↔ Business`, `Person ↔ Property`, `Person ↔ Related Person`, `Business ↔ Contact Person`, `Business ↔ Principal`, `Matter ↔ Individual`, `Matter ↔ Business`, `Matter ↔ Property`, `Matter ↔ Multiple Related Parties`
- **A Business Contact is NOT automatically the Business Principal** — do not conflate these.
- **Multiple related individuals may have**: individual Matters, joint Matters, Business Matters, Property Matters — never collapse these merely for UI convenience.

### Client Presentation Layer
- **Internal status and client presentation should differ** — use client-friendly labels/descriptions rather than displaying internal terms directly.
- Example: `provider_docs_pending` internally → `Waiting on Provider` with description `We've requested the required information and are waiting for the provider to respond.` externally.
- **Current Status / Next Step / Waiting On / Action Needed are separate concepts** — do not flatten into one enum/combined card.

### "Waiting On" as First-Class Concept
- `responsibility_state` values: `client`, `pinnacle`, `third_party`, `none` — these map to `responsibilityBanner()` labels: `Waiting on you`, `Waiting on third party`, `Pinnacle is working`, `Complete`.
- `blocked_reason_client_safe` — client-safe explanation when blocked (max 500 chars). Required when `status = blocked` or `responsibility_state = third_party` in API patch.
- **Do not expose raw enums** — use client-friendly labels via `responsibilityBanner()` / `clientStageLabel()`.

### "Next Step" Presentation
- `next_action_label` + `next_action_type` → `nextActionHref()` / `nextActionButtonLabel()`.
- Examples: `Upload file`, `Open to sign`, `Review billing`, `Review quote`, `Open calendar`, `Send an update`, `Open this work`.
- **Do not auto-generate fake next steps** — if no truthful Next Step exists, omit it or show neutral state.
- **Support a concise client-facing Next Step** on Matter Detail at the top, separate from Status card.

### Document Workflow
- **Do not assume `source === requested` means client action is required**. The system distinguishes: `document`, `file request`, `upload`, `review`, `completion`.
- **Use existing lifecycle**: `Requested` → `Awaiting Client` → `Received` → `Under Review` → `Accepted`.
- **Document Display Groups** (Documents page):
  1. **Action Needed**: requested + not yet approved
  2. **Recently Added**: non-action documents, first 5 sorted by date
  3. **All Other Documents**: everything else not in groups 1 or 2
  - A document must not appear in all three sections.
- **Document card shows**: Name, Type/category, Matter, Relevant year, Date, Size, Status (client-readable terminology).
- **Distinct client actions**: View, Download, Upload Requested File, Replace File (as appropriate).
- **Do not make the filename itself the only clickable target**.
- **When a requested file is successfully provided**: file exists, request advances/ completes, active client action disappears, Matter latest activity changes, client-safe timeline gains an event — support downstream behavior via existing architecture; do NOT build a new notification framework in this sprint.

### Matter Command Center (Matter Detail)
- **Top of Matter Detail**: clearly separate these concepts:
  - **Current Status** (StatusBadge tone from `responsibilityBanner()`)
  - **Next Step** (next_action_label + button via `nextActionButtonLabel()`)
  - **Waiting On** (responsibilityBanner label: "Waiting on you" / "Waiting on third party")
  - **Action Needed** (same as Waiting On — displayed when responsibility_state = client)
  - **Latest Update** (last_client_update_at or most recent update body)
  - **Your Pinnacle Contact** (owner_name from matter + assigned staff)
- **Also clearly show what the Matter concerns**: Person, Business, Property, Related Parties — reuse existing `matter_parties` / `relationship_parties` data.
- **Do not combine** Status/Next Step/Waiting On into one overloaded status card.

### Client-Safe Timeline
- **This is NOT the raw activity table** and NOT the admin audit log.
- **Only expose events safe and useful to a client**. Safe events include: `Request Received`, `Consultation Completed`, `Scope Approved`, `Agreement Signed`, `Payment Received`, `Document Requested`, `Document Received`, `Appointment Scheduled`, `Matter Status Updated`, `Provider Contacted`, `Inspection Completed`, `Report Available`, `Matter Completed`, `Client Update Posted`.
- **Do not expose**: internal notes, internal DMs, staff comments, security events, role changes, QA events, assignment debates, private vendor notes, backend events.
- **If the current activity architecture does not reliably distinguish client-visible events, implement an explicit safe visibility/filtering mechanism BEFORE exposing activity**. Fail closed.
- Timeline events should expose: `timestamp`, `client-friendly title`, `optional description`, `event type`, `safe actor name when useful`, `related record/link`.

### Multi-Party Access
- **A Matter may involve more than one client/contact**. Do not assume one Matter = one user.
- Ensure the client portal enforces access correctly for legitimate related participants without exposing unrelated Matter data.
- **Do not redesign the permissions architecture** unless required for correctness.

### Mobile (375px Required Viewport)
- **Check**: Dashboard Action Center, Documents, Matter Detail, Timeline.
- **No**: horizontal scrolling, clipped names, overflowing badges, unreachable tabs, tiny action targets, desktop-only tables, modal overflow.
- **Priority content on mobile**: Action Needed, Current Status, Next Step, Waiting On, CTA.
- **Secondary metadata comes afterward**.

### Accessibility
- **Preserve/improve**: semantic headings, keyboard behavior, focus states, button/link semantics, labels, contrast, touch target sizes, status not dependent only on color, reduced-motion preferences.

## Verification Checklist
Before considering sprint complete, run:
- `npm run typecheck` — must pass
- `npm run build` — must succeed
- `npm test` — verify no regressions

Test scenarios (where test data/fixtures allow):
- Client with no action → "You're All Caught Up" state
- Client with document request → Action Needed section displays
- Client after requested document upload → request marked fulfilled, action disappears
- Client with invoice/signature action → proper CTA displayed
- Matter waiting on client → "Waiting on you" banner
- Matter waiting on Pinnacle → "Pinnacle is working" banner
- Matter waiting on third party → "Waiting on third party" banner with blocked_reason
- Matter with timeline activity → client-safe events only
- Matter with no client-visible timeline activity → neutral state
- Completed Matter → "Complete" banner
- Multi-party Matter → correct access enforcement
- 375px mobile → usable viewport

## Key Filenames & Purposes
- `shared/matterWorkspace.ts` — responsibility resolution, client stages, next actions, milestone logic
- `functions/_lib/routes/portal.ts` — all API routes (matters, documents, tasks, billing, appointments, etc.)
- `migrations/` — D1 schema migrations (81 files); key additions: `next_action_label`, `next_action_type`, `next_action_due_at`, `blocked_reason_client_safe`, `client_stage`, `responsibility_state`, `client_visible` on milestones
- `src/pages/portal/Dashboard.tsx` — "Next Move" + "Needs Your Attention" aggregation
- `src/pages/portal/MatterDetail.tsx` — Matter detail page with status banner, timeline, updates, parties, files
- `src/pages/portal/Documents.tsx` — Document center with action-required / recently added / all-groups
- `functions/mid.ts` — auth middleware: `requireUser`, `requireStaff`, `requireAdmin`, `resolveClientId`, `loadScopedRow`, `scopeFilter`
- `functions/scope.ts` — `visibleClientIds`, `canAccessClient`, `scopeFilter`, `loadScopedRow`