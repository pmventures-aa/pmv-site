# Pinnacle Management Ventures - Email & Notification Template Library

Master copy library for every transactional email and system notification. Each template is production-ready: drop the body into the notification system, register any new variables in `shared/emailVariables.ts`, and map the template key.

**Conventions that apply to every template**
- The branded header (crest, firm name) and footer (contact details, legal line) are applied by the email layout. Bodies below intentionally end without a signature block; the layout supplies "Pinnacle Management Ventures" and contact info.
- Variables are `{{lowercase_snake_case}}`. Optional content uses `{{#if variable}}...{{/if}}`.
- Unresolved variables render as empty strings; conditional sections keep sentences from dangling.
- "Pinnacle Management Ventures" on first formal reference, "PMV" afterward.
- The tagline "Professional Support. One Call Away." appears only where noted; it is not appended mechanically.

---

## Account and welcome messages

### 1. Client Welcome
- **Key:** `client_welcome`
- **Audience:** Client
- **Trigger:** Client account is created and activated
- **Subject:** Welcome to Pinnacle - your account is ready
- **Preview:** One point of contact for business, property, and administrative matters.
- **Heading:** Welcome, {{recipient_first_name}}

**Body:**

Hi {{recipient_first_name}},

Welcome to Pinnacle Management Ventures. Your account is active, and your Client Portal is ready.

PMV works as one coordinated point of contact: instead of juggling separate providers, appointments, and paperwork, you bring the matter to us and we keep the moving pieces connected. Professional Support. One Call Away.

In your portal you can submit requests, follow the status of work in progress, review and sign documents, see appointments and invoices, and message our team securely.

A good first step: open your portal and look around. When something needs attention, start a request there{{#if support_phone}} or call us at {{support_phone}}{{/if}}.

We are glad to have you with us.

- **Primary CTA:** Open Your Portal -> `{{portal_url}}`
- **Variables:** `{{recipient_first_name}}` recipient's first name; `{{portal_url}}` client portal home; `{{support_phone}}` firm phone (optional).
- **Implementation note:** Send once on activation. Wrap the phone sentence in `{{#if support_phone}}`.

### 2. HQ Staff Welcome
- **Key:** `hq_staff_welcome`
- **Audience:** HQ staff
- **Trigger:** Staff account is provisioned
- **Subject:** Your Pinnacle HQ access is ready
- **Preview:** Where to sign in, what you can do, and where to get help.
- **Heading:** Welcome to the team, {{recipient_first_name}}

**Body:**

Hi {{recipient_first_name}},

Your Pinnacle Management Ventures HQ account is set up{{#if staff_role}} with the {{staff_role}} role{{/if}}. HQ is where client work is coordinated: requests, assignments, messages, documents, billing, and scheduling all live there, scoped to what your role needs.

Sign in, confirm your profile details, and review the sections you have access to. Your permissions determine what you see; if something you need is missing, that is a quick fix rather than a problem.

For access questions or anything unclear in your first days, contact {{#if hq_contact_name}}{{hq_contact_name}} at {{hq_contact_email}}{{/if}}{{#if support_email}} or {{support_email}}{{/if}}.

- **Primary CTA:** Open HQ -> `{{dashboard_url}}`
- **Variables:** `{{recipient_first_name}}` staff first name; `{{staff_role}}` assigned role (optional); `{{dashboard_url}}` HQ dashboard; `{{hq_contact_name}}` onboarding contact (optional); `{{hq_contact_email}}` their email (optional); `{{support_email}}` fallback help address (optional).
- **Implementation note:** If neither contact variable resolves, drop the final sentence entirely with nested conditionals.

### 3. Vendor Application Received
- **Key:** `vendor_application_received`
- **Audience:** Provider / vendor applicant
- **Trigger:** Application submitted
- **Subject:** We received your application
- **Preview:** What happens next in the review process.
- **Heading:** Application received

**Body:**

Hi {{recipient_first_name}},

Thank you for applying to the Pinnacle Management Ventures professional network. Your application{{#if application_id}} ({{application_id}}){{/if}} was received{{#if application_submitted_at}} on {{application_submitted_at}}{{/if}} and is in review.

Our team looks at each application individually, including the services you offer, your coverage area, and the supporting details you provided. If anything needs clarification, we will reach out; watch your email in case we do.

Receiving this confirmation means your application arrived safely. It is not an approval decision, and no action is needed from you right now unless we contact you.

- **Primary CTA:** Review Application Status -> `{{application_url}}`
- **Variables:** `{{recipient_first_name}}` applicant first name; `{{application_id}}` reference number (optional); `{{application_submitted_at}}` submission time (optional); `{{application_url}}` status page.
- **Implementation note:** Send immediately on submission. Keep the "not an approval" sentence; it prevents disputes.

### 4. Vendor Approved
- **Key:** `vendor_approved`
- **Audience:** Provider / vendor
- **Trigger:** Application status changes to approved
- **Subject:** Your Pinnacle network application is approved
- **Preview:** Next step: finish your provider setup.
- **Heading:** You're approved, {{recipient_first_name}}

**Body:**

Hi {{recipient_first_name}},

Good news: your application to the Pinnacle Management Ventures professional network has been approved{{#if provider_service_type}} for {{provider_service_type}}{{/if}}.

Your next step is to finish setup in your provider portal: confirm your profile and availability, and complete any remaining onboarding items so we can consider you when matching work.

One expectation worth setting clearly: approval means PMV may offer you assignments that fit your services, area, and availability. It does not guarantee assignments or any particular volume of work. When an opportunity fits, you will see it and can accept or decline.

Welcome to the network.

- **Primary CTA:** Complete Provider Setup -> `{{portal_url}}`
- **Variables:** `{{recipient_first_name}}` provider first name; `{{provider_service_type}}` approved service category (optional); `{{portal_url}}` provider portal.
- **Implementation note:** Pair with HQ template 33. Never add language implying guaranteed or recurring work.

### 5. Portal or HQ Reminder
- **Key:** `portal_or_hq_reminder`
- **Audience:** Any portal user (client, staff, or provider)
- **Trigger:** An outstanding portal action passes its nudge threshold
- **Subject:** A quick item is waiting in your portal
- **Preview:** One outstanding step, and the date we recommend finishing it by.
- **Heading:** One thing needs your attention

**Body:**

Hi {{recipient_first_name}},

A quick reminder: there is an outstanding item in your portal that still needs you.

**Waiting on you:** {{message_preview}}
{{#if follow_up_deadline}}**Recommended by:** {{follow_up_deadline}}{{/if}}

Completing it usually takes just a few minutes, and it keeps anything that depends on it from stalling. If you have already handled this, you can disregard this note; the portal will show the current status.

Questions? Reply to this email{{#if support_email}} or write {{support_email}}{{/if}}.

- **Primary CTA:** Open Your Portal -> `{{portal_url}}`
- **Variables:** `{{recipient_first_name}}` recipient first name; `{{message_preview}}` one-line description of the outstanding item; `{{follow_up_deadline}}` recommended completion date (optional); `{{portal_url}}` portal deep link to the item; `{{support_email}}` help address (optional).
- **Implementation note:** Populate `{{message_preview}}` from the pending-task description. Point `{{portal_url}}` at the specific item, not the portal home.

### 6. Password Reset
- **Key:** `password_reset`
- **Audience:** Any account holder
- **Trigger:** Password reset requested
- **Subject:** Reset your Pinnacle password
- **Preview:** This link works once and expires soon.
- **Heading:** Password reset requested

**Body:**

Hi {{recipient_first_name}},

We received a request to reset the password for the Pinnacle account associated with this email address.

Use the button below to choose a new password. The link can be used once and expires at {{password_reset_expires_at}}.

If you did not request this, no changes have been made and your current password still works. You can safely ignore this email{{#if support_email}}, or let us know at {{support_email}} if something seems off{{/if}}.

{{#if request_time}}Request received {{request_time}}{{#if request_ip_address}} from IP {{request_ip_address}}{{/if}}.{{/if}}

- **Primary CTA:** Reset Password -> `{{password_reset_url}}`
- **Variables:** `{{recipient_first_name}}` account holder first name; `{{password_reset_url}}` one-time reset link; `{{password_reset_expires_at}}` link expiry; `{{request_time}}` when requested (optional); `{{request_ip_address}}` requesting IP (optional); `{{support_email}}` security contact (optional).
- **Implementation note:** Never include the account email in the body beyond "this email address." Keep the metadata line conditional so it disappears cleanly when unavailable.

### 7. Staff Event Announcement
- **Key:** `staff_event_announcement`
- **Audience:** HQ staff
- **Trigger:** New internal event published
- **Subject:** Team event: {{event_name}}
- **Preview:** Date, location, and how to RSVP.
- **Heading:** {{event_name}}

**Body:**

Hi {{recipient_first_name}},

We are holding {{event_name}} and would like you there.

**When:** {{event_date}} at {{event_time}}
**Where:** {{event_location}}
{{#if event_details}}**Details:** {{event_details}}{{/if}}

Please RSVP so we can plan headcount{{#if follow_up_deadline}} by {{follow_up_deadline}}{{/if}}. If the timing does not work for you, an RSVP of "no" is genuinely helpful too.

{{#if service_notes}}To prepare: {{service_notes}}{{/if}}

- **Primary CTA:** RSVP Now -> `{{rsvp_url}}`
- **Secondary CTA:** View Event Details -> `{{event_url}}`
- **Variables:** `{{recipient_first_name}}` staff first name; `{{event_name}}` event title; `{{event_date}}` date; `{{event_time}}` start time; `{{event_location}}` venue or link; `{{event_details}}` purpose/agenda (optional); `{{follow_up_deadline}}` RSVP-by date (optional); `{{service_notes}}` preparation notes (optional); `{{rsvp_url}}` RSVP action; `{{event_url}}` full event page.
- **Implementation note:** Subject carries `{{event_name}}`; keep titles short in the event editor so subjects stay scannable.

### 8. Staff Event Reminder / Update
- **Key:** `staff_event_reminder_or_update`
- **Audience:** HQ staff
- **Trigger:** Scheduled reminder before the event, or event details change
- **Subject:** Update: {{event_name}} on {{event_date}}
- **Preview:** Current details and your RSVP status.
- **Heading:** Reminder: {{event_name}}

**Body:**

Hi {{recipient_first_name}},

A quick update on {{event_name}}.

{{#if event_details}}**What changed:** {{event_details}}{{/if}}

**Current details**
**When:** {{event_date}} at {{event_time}}
**Where:** {{event_location}}

{{#if invitation_status}}Our records show your RSVP as: {{invitation_status}}. If that is still right, you are all set.{{/if}} If your plans have changed either way, please update your RSVP so the count stays accurate.

See you there.

- **Primary CTA:** Update RSVP -> `{{rsvp_url}}`
- **Secondary CTA:** View Event Details -> `{{event_url}}`
- **Variables:** `{{recipient_first_name}}` staff first name; `{{event_name}}` event title; `{{event_details}}` change summary, omit for plain reminders (optional); `{{event_date}}` date; `{{event_time}}` time; `{{event_location}}` venue; `{{invitation_status}}` recorded RSVP (optional); `{{rsvp_url}}` RSVP action; `{{event_url}}` event page.
- **Implementation note:** For a plain reminder, leave `{{event_details}}` empty and the "What changed" block disappears; the same template serves both cases.

---

## Invitations

### 9. Client Invitation
- **Key:** `client_invitation`
- **Audience:** Prospective or provisioned client
- **Trigger:** Staff sends a client invitation
- **Subject:** Your Pinnacle client account is waiting
- **Preview:** Activate your portal to keep every matter in one place.
- **Heading:** You're invited, {{recipient_first_name}}

**Body:**

Hi {{recipient_first_name}},

{{#if inviter_name}}{{inviter_name}} at Pinnacle Management Ventures has set up a client account for you.{{/if}}{{#unless inviter_name}}Pinnacle Management Ventures has set up a client account for you.{{/unless}}

Activating it takes about a minute and gives you a private portal where requests, documents, appointments, invoices, and messages stay organized in one place, with our team coordinating the work behind them. Professional Support. One Call Away.

This secure invitation link is unique to you{{#if invitation_expires_at}} and expires {{invitation_expires_at}}{{/if}}. If it lapses, just ask and we will send a fresh one.

- **Primary CTA:** Activate Your Account -> `{{invitation_url}}`
- **Variables:** `{{recipient_first_name}}` invitee first name; `{{inviter_name}}` staff member who invited them (optional); `{{invitation_url}}` one-time activation link; `{{invitation_expires_at}}` link expiry (optional).
- **Implementation note:** Use the `#if/#unless` pair on `{{inviter_name}}` so exactly one opening sentence renders.

### 10. HQ Staff Invitation
- **Key:** `hq_staff_invitation`
- **Audience:** Incoming staff member
- **Trigger:** Staff invitation sent with a role template
- **Subject:** Set up your Pinnacle HQ account
- **Preview:** Activate your access and complete onboarding.
- **Heading:** Your HQ access awaits

**Body:**

Hi {{recipient_first_name}},

{{#if inviter_name}}{{inviter_name}} has invited you{{/if}}{{#unless inviter_name}}You have been invited{{/unless}} to set up your Pinnacle Management Ventures HQ account{{#if invitation_role}} with the {{invitation_role}} role{{/if}}.

Activating your account gives you access to the tools your role uses: client records, assignments, messaging, documents, and scheduling, scoped to your responsibilities. Once you are in, a short onboarding checklist will walk you through profile setup.

This link is unique to you{{#if invitation_expires_at}} and expires {{invitation_expires_at}}{{/if}}. Questions before you start? Reply to this email.

- **Primary CTA:** Accept Invitation -> `{{invitation_url}}`
- **Variables:** `{{recipient_first_name}}` invitee first name; `{{inviter_name}}` inviting staff member (optional); `{{invitation_role}}` role template name (optional); `{{invitation_url}}` activation link; `{{invitation_expires_at}}` expiry (optional).
- **Implementation note:** Role names come from role templates; keep them human-readable in the role editor.

### 11. Vendor Invitation
- **Key:** `vendor_invitation`
- **Audience:** Prospective provider / vendor
- **Trigger:** Staff sends a provider invitation
- **Subject:** An invitation to the Pinnacle professional network
- **Preview:** Apply to take on work that fits your services and area.
- **Heading:** We'd like you to apply

**Body:**

Hi {{recipient_first_name}},

{{#if inviter_name}}{{inviter_name}} at Pinnacle Management Ventures thought of you for our professional network{{#if provider_service_type}} based on your {{provider_service_type}} work{{/if}}.{{/if}}{{#unless inviter_name}}Pinnacle Management Ventures is inviting you to apply to our professional network{{#if provider_service_type}} for {{provider_service_type}} work{{/if}}.{{/unless}}

PMV coordinates business, property, and administrative work for clients and matches assignments to independent professionals whose services, coverage area, and availability fit. You choose what to accept; there is no obligation attached to applying.

The application takes a few minutes: tell us about your services, area, and credentials. Applying starts a review; it does not guarantee approval or work volume, and we are upfront about that so expectations stay clear.

This invitation link{{#if invitation_expires_at}} expires {{invitation_expires_at}} and{{/if}} is unique to you.

- **Primary CTA:** Start Your Application -> `{{invitation_url}}`
- **Variables:** `{{recipient_first_name}}` invitee first name; `{{inviter_name}}` inviting staff member (optional); `{{provider_service_type}}` known specialty (optional); `{{invitation_url}}` application link; `{{invitation_expires_at}}` expiry (optional).
- **Implementation note:** The no-guarantee sentence is required; do not soften it away in edits.

### 12. Trusted Contact Invitation
- **Key:** `trusted_contact_invitation`
- **Audience:** Invited trusted contact
- **Trigger:** Client designates a trusted contact
- **Subject:** {{client_name}} has named you a trusted contact
- **Preview:** What this role includes and how to accept or decline.
- **Heading:** A trusted contact invitation

**Body:**

Hi {{recipient_first_name}},

{{client_name}} has invited you to be a trusted contact on their Pinnacle Management Ventures account{{#if trusted_contact_relationship}} as their {{trusted_contact_relationship}}{{/if}}.

**What this means:** a trusted contact gets limited, clearly defined access that {{client_name}} controls, typically the ability to view certain documents, appointments, or updates so someone they trust can stay informed. It does not give you control of their account, and {{client_name}} can adjust or remove the access at any time.

**Your choice:** accepting is entirely up to you, and declining is perfectly fine; {{client_name}} will simply see that the invitation was not accepted. If you were not expecting this, you can ignore it{{#if support_email}} or check with us at {{support_email}}{{/if}}.

This invitation{{#if invitation_expires_at}} expires {{invitation_expires_at}}{{/if}}.

- **Primary CTA:** Review and Respond -> `{{invitation_url}}`
- **Variables:** `{{recipient_first_name}}` contact first name; `{{client_name}}` inviting client; `{{trusted_contact_relationship}}` stated relationship (optional); `{{invitation_url}}` accept/decline page; `{{invitation_expires_at}}` expiry (optional); `{{support_email}}` verification contact (optional).
- **Implementation note:** The CTA page must offer both accept and decline; this email deliberately does not link straight to acceptance.

---

## Invoices and quotes

### 13. Invoice Available
- **Key:** `invoice_available`
- **Audience:** Client
- **Trigger:** Invoice issued
- **Subject:** Invoice {{invoice_number}} from Pinnacle
- **Preview:** Amount, due date, and secure payment link inside.
- **Heading:** Your invoice is ready

**Body:**

Hi {{recipient_first_name}},

A new invoice is ready on your account.

**Invoice:** {{invoice_number}}
**Amount:** {{invoice_amount}}
**Due:** {{invoice_due_date}}
{{#if service_notes}}**Covers:** {{service_notes}}{{/if}}

You can review the full detail and pay securely through your portal. If anything on this invoice looks unfamiliar or you have a billing question, reply to this email{{#if support_email}} or write {{support_email}}{{/if}} and we will straighten it out before the due date.

- **Primary CTA:** Review Invoice -> `{{invoice_url}}`
- **Secondary CTA:** Pay Invoice -> `{{payment_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{invoice_number}}` invoice reference; `{{invoice_amount}}` total; `{{invoice_due_date}}` due date; `{{service_notes}}` short description of what it covers (optional); `{{invoice_url}}` invoice detail; `{{payment_url}}` payment page; `{{support_email}}` billing contact (optional).
- **Implementation note:** Both CTAs earn their place here; keep Review primary so clients read before paying.

### 14. Quote Available
- **Key:** `quote_available`
- **Audience:** Client or prospect
- **Trigger:** Quote sent
- **Subject:** Your Pinnacle quote is ready to review
- **Preview:** Scope, amount, and how to accept when you are ready.
- **Heading:** Quote {{quote_number}}

**Body:**

Hi {{recipient_first_name}},

Thanks for the opportunity. Your quote is ready:

**Quote:** {{quote_number}}
**Amount:** {{quote_amount}}
{{#if quote_expiration_date}}**Valid through:** {{quote_expiration_date}}{{/if}}

The full scope, line items, and terms are in the quote itself. If everything looks right, you can accept online and we will take it from there. If you would like to adjust the scope or talk anything through first, just reply; quotes are a starting point for getting it right, not a take-it-or-leave-it.

- **Primary CTA:** Review Quote -> `{{quote_url}}`
- **Secondary CTA:** Accept Quote -> `{{accept_quote_url}}`
- **Variables:** `{{recipient_first_name}}` recipient first name; `{{quote_number}}` quote reference; `{{quote_amount}}` quoted total; `{{quote_expiration_date}}` validity end (optional); `{{quote_url}}` quote detail; `{{accept_quote_url}}` acceptance action.
- **Implementation note:** If the platform later adds per-quote messages, insert them between the amount block and the closing paragraph.

---

## Client discovery nurture sequence

A connected seven-message arc: how PMV works, what it covers, who does the work, how to start, what you might miss, where it all lives, and a low-pressure close. Openings, angles, and CTAs deliberately vary.

### 15. Nurture Day 2: How Pinnacle Works
- **Key:** `nurture_day_2_how_pinnacle_works`
- **Audience:** New prospect / registered client (pre-engagement)
- **Trigger:** Day 2 of the discovery sequence
- **Subject:** The idea behind Pinnacle, in one minute
- **Preview:** Why one point of contact changes how things get done.
- **Heading:** One call instead of five

**Body:**

Hi {{recipient_first_name}},

Here is the idea behind Pinnacle Management Ventures, in the time it takes to drink half a coffee.

Most business, property, and administrative headaches are not hard because any single task is hard. They are hard because *coordination* is hard: finding the right person, briefing them, chasing updates, keeping the paperwork straight, and remembering whose turn it is to act. That overhead lands on you.

PMV exists to absorb that overhead. You bring us the matter; we figure out the path, line up the right people, keep the pieces moving, and keep you informed through one point of contact. You always know what is happening and what happens next, without running the project yourself.

Professional Support. One Call Away. That is the whole model.

Over the next two weeks we will send a handful of short notes on what that looks like in practice. No pressure attached; when something on your plate fits, you will know where to bring it.

- **Primary CTA:** See How It Works -> `{{portal_url}}`
- **Variables:** `{{recipient_first_name}}` recipient first name; `{{portal_url}}` how-it-works page or portal.
- **Implementation note:** Point the CTA at the public how-it-works page for prospects, the portal for registered clients.

### 16. Nurture Day 4: Explore Services
- **Key:** `nurture_day_4_explore_services`
- **Audience:** Same sequence recipient
- **Trigger:** Day 4 of the discovery sequence
- **Subject:** What can you actually hand to Pinnacle?
- **Preview:** Three broad lanes, and a simple rule of thumb.
- **Heading:** More than you might expect

**Body:**

Hi {{recipient_first_name}},

"What do you actually do?" is the question we hear most, so here is the honest answer without a wall of service names.

PMV coordinates work in three broad lanes:

**Business and operations.** Administrative capacity, vendor changes, payment and POS transitions, project coordination, the operational work that eats an owner's week.

**Property and field.** Property checks, inspections and verification visits, cleaning and turnovers, and having a dependable person on the ground when you cannot be there.

**Documents and mobile support.** Notary work, document runs, courier and filing errands, signing support, and the paperwork in between.

The rule of thumb: if it needs a capable, accountable person to handle it and follow through, it is worth asking us. When something falls outside what we should do ourselves, we say so and help you find the right path anyway.

- **Primary CTA:** Explore Services -> `{{dashboard_url}}`
- **Variables:** `{{recipient_first_name}}` recipient first name; `{{dashboard_url}}` services overview page.
- **Implementation note:** Reuse the public services URL in `{{dashboard_url}}` for prospects; the three lanes mirror the site's service hubs.

### 17. Nurture Day 6: The Network
- **Key:** `nurture_day_6_the_network`
- **Audience:** Same sequence recipient
- **Trigger:** Day 6 of the discovery sequence
- **Subject:** Who actually does the work
- **Preview:** A network of professionals, one point of contact for you.
- **Heading:** One relationship, many capable hands

**Body:**

Hi {{recipient_first_name}},

A fair question about any coordinator: who is actually doing the work?

Some of it, PMV handles directly. For the rest, we maintain a network of independent professionals: field specialists, cleaners, notaries, and other providers, each engaged for the work that fits them. They are independent businesses, not PMV employees, and we think that honesty matters: you should know exactly who you are working with.

What stays constant is the relationship. PMV briefs the provider, sets the expectations, tracks the work, collects the documentation, and remains your single point of contact throughout. If something is off, you tell us once; we handle the follow-up. You never have to manage a stranger, chase a subcontractor, or repeat your situation to five different people.

That structure, specialists doing what they are best at with one accountable coordinator in front of them, is what makes a broad range of work feel simple from your side.

- **Primary CTA:** Meet the Approach -> `{{portal_url}}`
- **Variables:** `{{recipient_first_name}}` recipient first name; `{{portal_url}}` network/approach page.
- **Implementation note:** The independence disclosure is deliberate and required; keep it through any copy edits.

### 18. Nurture Day 8: One Request
- **Key:** `nurture_day_8_one_request`
- **Audience:** Same sequence recipient
- **Trigger:** Day 8 of the discovery sequence
- **Subject:** Start with the situation, not the solution
- **Preview:** You do not need to know the right service to start.
- **Heading:** You bring the problem. We bring the plan.

**Body:**

Hi {{recipient_first_name}},

Here is a small but real barrier we try to remove: most services ask you to know what you need before you ask. Pick the category, choose the package, book the slot.

With PMV, you start with the situation. "A tenant moved out and the place needs to be rent-ready." "We are switching payment processors and nobody owns the transition." "I need documents signed and filed across town by Friday." That is a complete request.

From there, we scope it: what needs to happen, in what order, who is right for each piece, and what it will take. You review the plan before anything moves. One request in plain language replaces the hours of figuring-out that usually come first.

If something like that is sitting on your list right now, this is exactly the kind of thing to send us.

- **Primary CTA:** Start a Request -> `{{portal_url}}`
- **Variables:** `{{recipient_first_name}}` recipient first name; `{{portal_url}}` request intake link.
- **Implementation note:** Point the CTA at the scope-request intake, which mirrors this "start with the situation" framing.

### 19. Nurture Day 10: Did You Know
- **Key:** `nurture_day_10_did_you_know`
- **Audience:** Same sequence recipient
- **Trigger:** Day 10 of the discovery sequence
- **Subject:** Three things people miss about Pinnacle
- **Preview:** Documentation, visibility, and flexible engagement.
- **Heading:** The quiet features that earn their keep

**Body:**

Hi {{recipient_first_name}},

Three things clients often discover later than they should:

**The work documents itself.** Field visits and completed jobs come back with photos, timestamps, and notes, a real record you can rely on, forward, or file, not a verbal "all done."

**You can watch progress without asking.** Requests move through clear stages, and your portal shows exactly where each one stands. "Just checking in" emails become optional.

**Engagement flexes to the work.** One task, a defined project, a transition, or ongoing support; the structure follows the need. Trying PMV on something small is a perfectly good way to start, and plenty of clients do.

None of these are headline features, but together they are why the second request tends to follow the first.

- **Primary CTA:** See It in the Portal -> `{{portal_url}}`
- **Variables:** `{{recipient_first_name}}` recipient first name; `{{portal_url}}` portal or features page.
- **Implementation note:** If a features tour page exists, prefer it here over the raw portal login.

### 20. Nurture Day 12: The Portal
- **Key:** `nurture_day_12_portal`
- **Audience:** Same sequence recipient
- **Trigger:** Day 12 of the discovery sequence
- **Subject:** Where everything lives
- **Preview:** Requests, documents, messages, invoices, one organized place.
- **Heading:** Your side of the table

**Body:**

Hi {{recipient_first_name}},

We have talked about how PMV coordinates work. Today, the part you interact with: your Client Portal.

Think of it as the organized version of the folder, inbox, and sticky notes a project usually generates. In one place you can:

- Submit a new request and watch it move through each stage
- Read and send secure messages without digging through email
- Review, sign, and store documents connected to your work
- See appointments, invoices, and payment history
- Look back at completed work, including field documentation

Nothing gets lost between people, and you are never reconstructing what happened from memory. Whether a matter takes three days or three months, the record is there when you need it.

If you have not opened your portal yet, five minutes of looking around will make everything in these emails concrete.

- **Primary CTA:** Open Your Portal -> `{{portal_url}}`
- **Variables:** `{{recipient_first_name}}` recipient first name; `{{portal_url}}` portal home.
- **Implementation note:** For recipients who have never activated, swap the CTA target to the activation link via the send-time context.

### 21. Nurture Day 14: What's Next
- **Key:** `nurture_day_14_whats_next`
- **Audience:** Same sequence recipient
- **Trigger:** Day 14, final message of the discovery sequence
- **Subject:** Whenever you're ready
- **Preview:** A simple way to start, and a standing offer.
- **Heading:** The short version, and a standing offer

**Body:**

Hi {{recipient_first_name}},

This is the last note in this series, so here is the whole thing in three lines:

PMV is one trusted point of contact for business, property, and administrative matters. You bring the situation; we scope it, coordinate the right people, and keep you informed until it is done and documented. You stay in control without carrying the coordination.

If something on your plate fits, starting is genuinely simple: send one request in plain language, and we will come back with a clear next step. No commitment is created by asking, and "can you even help with this?" is a question we are happy to answer honestly.

And if now is not the moment, that is fine too. Your account stays ready, and so do we{{#if support_phone}}; you can always just call {{support_phone}}{{/if}}.

Thanks for reading along.

- **Primary CTA:** Start a Request -> `{{portal_url}}`
- **Variables:** `{{recipient_first_name}}` recipient first name; `{{portal_url}}` request intake; `{{support_phone}}` firm phone (optional).
- **Implementation note:** Suppress the whole sequence for any recipient who submits a request mid-stream; this closer assumes no engagement yet.

---

## Field work

### 22. Field Assignment Audit
- **Key:** `field_assignment_audit`
- **Audience:** Staff member or provider responsible for the assignment
- **Trigger:** An assignment is flagged for review or audit
- **Subject:** Review needed: assignment at {{property_address}}
- **Preview:** Why it was flagged and what to do by the deadline.
- **Heading:** Assignment flagged for review

**Body:**

Hi {{recipient_first_name}},

A field assignment you are responsible for has been flagged and needs your review.

**Assignment:** {{service_request_id}}{{#if service_type}} ({{service_type}}){{/if}}
**Property:** {{property_address}}{{#if property_city}}, {{property_city}}{{/if}}
**Reason for review:** {{issue_summary}}
{{#if follow_up_deadline}}**Respond by:** {{follow_up_deadline}}{{/if}}

Open the assignment to see the flagged detail, then either supply what is missing (documentation, photos, corrected status) or add a note explaining the discrepancy. Flags are routine quality control, not accusations; a quick, accurate response is all that is needed to clear most of them.

If something prevents you from responding{{#if follow_up_deadline}} by the deadline{{/if}}, say so in the assignment notes rather than letting it lapse.

- **Primary CTA:** Review Assignment -> `{{assignment_url}}`
- **Variables:** `{{recipient_first_name}}` responsible person's first name; `{{service_request_id}}` assignment reference; `{{service_type}}` work type (optional); `{{property_address}}` site address; `{{property_city}}` city (optional); `{{issue_summary}}` why it was flagged; `{{follow_up_deadline}}` response deadline (optional); `{{assignment_url}}` assignment detail.
- **Implementation note:** Populate `{{issue_summary}}` from the audit reason code's human label, never the raw code.

---

## HQ notifications

Internal operational alerts. Short, factual, action-first. The recipient is always PMV staff, so context is compressed and the CTA leads straight to the record.

### 23. HQ: Application Needs Follow-Up
- **Key:** `hq_application_needs_follow_up`
- **Audience:** HQ staff (reviewer)
- **Trigger:** An application sits past its follow-up threshold or is marked needs-info
- **Subject:** Follow up: application {{application_id}}
- **Preview:** {{provider_name}} is waiting on a next step.
- **Heading:** Application needs follow-up

**Body:**

The application from {{provider_name}}{{#if provider_service_type}} ({{provider_service_type}}){{/if}} needs a follow-up.

**Status:** {{application_status}}
{{#if application_submitted_at}}**Submitted:** {{application_submitted_at}}{{/if}}
{{#if issue_summary}}**Outstanding:** {{issue_summary}}{{/if}}
{{#if follow_up_deadline}}**Target:** {{follow_up_deadline}}{{/if}}

Review the application and either advance it, request the missing information, or record why it is on hold.

- **Primary CTA:** Review Application -> `{{application_url}}`
- **Variables:** `{{provider_name}}` applicant; `{{provider_service_type}}` category (optional); `{{application_id}}` reference; `{{application_status}}` current status; `{{application_submitted_at}}` submitted time (optional); `{{issue_summary}}` what is outstanding (optional); `{{follow_up_deadline}}` target date (optional); `{{application_url}}` HQ application record.
- **Implementation note:** Route to the assigned reviewer; fall back to the applications queue owner.

### 24. HQ: Message Awaiting Response
- **Key:** `hq_message_awaiting_response`
- **Audience:** HQ staff (thread owner)
- **Trigger:** An inbound message passes the response-time threshold
- **Subject:** Waiting on a reply: {{message_subject}}
- **Preview:** {{sender_name}} has been waiting since {{message_received_at}}.
- **Heading:** A message is waiting on us

**Body:**

{{sender_name}} sent a message that has not received a reply.

**Subject:** {{message_subject}}
**Received:** {{message_received_at}}
{{#if message_preview}}**Preview:** {{message_preview}}{{/if}}

Reply, or reassign the thread if it belongs with someone else. Response time is part of the client experience we sell.

- **Primary CTA:** View Message -> `{{message_url}}`
- **Variables:** `{{sender_name}}` who wrote in; `{{message_subject}}` thread subject; `{{message_received_at}}` when it arrived; `{{message_preview}}` first line (optional); `{{message_url}}` HQ thread.
- **Implementation note:** Suppress if the thread was answered between queueing and send.

### 25. HQ: New Client Registration
- **Key:** `hq_new_client_registration`
- **Audience:** HQ staff (client operations)
- **Trigger:** A client completes registration
- **Subject:** New client: {{client_name}}
- **Preview:** Registered {{registration_date}}. Assign a point of contact.
- **Heading:** New client registered

**Body:**

{{client_name}} completed registration{{#if registration_date}} on {{registration_date}}{{/if}}{{#if company_name}} ({{company_name}}){{/if}}.

{{#if account_type}}**Account type:** {{account_type}}{{/if}}

Next steps: confirm the account details, assign a primary point of contact, and make sure the welcome flow has fired.

- **Primary CTA:** Open Client Record -> `{{registration_url}}`
- **Variables:** `{{client_name}}` new client; `{{company_name}}` business name (optional); `{{registration_date}}` when (optional); `{{account_type}}` account category (optional); `{{registration_url}}` HQ client record.
- **Implementation note:** If auto-assignment exists, name the assignee via `{{staff_name}}` in a follow-up revision.

### 26. HQ: New Document Uploaded
- **Key:** `hq_new_document_uploaded`
- **Audience:** HQ staff (record owner)
- **Trigger:** A client, provider, or trusted contact uploads a document
- **Subject:** New document: {{document_name}}
- **Preview:** Uploaded by {{document_uploaded_by}}.
- **Heading:** Document uploaded

**Body:**

{{document_uploaded_by}} uploaded a document.

**Document:** {{document_name}}{{#if document_type}} ({{document_type}}){{/if}}
**Uploaded:** {{document_uploaded_at}}
{{#if client_name}}**Related to:** {{client_name}}{{/if}}{{#if property_name}} / {{property_name}}{{/if}}

Review it and file or act on it as the related record requires.

- **Primary CTA:** View Document -> `{{document_url}}`
- **Variables:** `{{document_uploaded_by}}` uploader; `{{document_name}}` file title; `{{document_type}}` category (optional); `{{document_uploaded_at}}` upload time; `{{client_name}}` related client (optional); `{{property_name}}` related property (optional); `{{document_url}}` secure HQ link.
- **Implementation note:** Never attach the file; always link into the authenticated workspace.

### 27. HQ: New Invoice Created
- **Key:** `hq_new_invoice_created`
- **Audience:** HQ staff (billing)
- **Trigger:** An invoice is created
- **Subject:** Invoice created: {{invoice_number}}
- **Preview:** {{invoice_amount}} for {{client_name}}, due {{invoice_due_date}}.
- **Heading:** Invoice created

**Body:**

Invoice {{invoice_number}} was created for {{client_name}}.

**Amount:** {{invoice_amount}}
**Due:** {{invoice_due_date}}
**Status:** {{invoice_status}}

Confirm the details are right before the client notification goes out, or correct them now while it is cheap.

- **Primary CTA:** Review Invoice -> `{{invoice_url}}`
- **Variables:** `{{invoice_number}}` reference; `{{client_name}}` billed client; `{{invoice_amount}}` total; `{{invoice_due_date}}` due date; `{{invoice_status}}` current status; `{{invoice_url}}` HQ invoice record.
- **Implementation note:** Only send for invoices created by automation or by another staff member, not the actor's own.

### 28. HQ: New Lead or Prospect
- **Key:** `hq_new_lead_or_prospect`
- **Audience:** HQ staff (sales/intake owner)
- **Trigger:** A lead arrives from any source
- **Subject:** New lead: {{lead_name}}
- **Preview:** {{lead_source}}{{#if lead_service_interest}} - interested in {{lead_service_interest}}{{/if}}.
- **Heading:** New lead in

**Body:**

A new lead just arrived.

**Name:** {{lead_name}}
{{#if lead_email}}**Email:** {{lead_email}}{{/if}}
{{#if lead_phone}}**Phone:** {{lead_phone}}{{/if}}
**Source:** {{lead_source}}
{{#if lead_service_interest}}**Interested in:** {{lead_service_interest}}{{/if}}

Speed matters most in the first hours. Review the details and make first contact or assign an owner now.

- **Primary CTA:** Open Lead -> `{{lead_url}}`
- **Variables:** `{{lead_name}}` lead; `{{lead_email}}` email (optional); `{{lead_phone}}` phone (optional); `{{lead_source}}` origin; `{{lead_service_interest}}` requested service (optional); `{{lead_url}}` HQ lead record.
- **Implementation note:** Route by source rules if defined; otherwise to the default intake owner.

### 29. HQ: New Message Received
- **Key:** `hq_new_message_received`
- **Audience:** HQ staff (thread owner or triage)
- **Trigger:** A new inbound message arrives
- **Subject:** New message from {{sender_name}}
- **Preview:** {{message_preview}}
- **Heading:** New message

**Body:**

{{sender_name}} sent a new message{{#if message_received_at}} at {{message_received_at}}{{/if}}.

**Subject:** {{message_subject}}
{{#if message_preview}}**Preview:** {{message_preview}}{{/if}}

Open the thread to read and respond.

- **Primary CTA:** View Message -> `{{message_url}}`
- **Variables:** `{{sender_name}}` sender; `{{message_subject}}` subject; `{{message_preview}}` first line (optional); `{{message_received_at}}` arrival time (optional); `{{message_url}}` HQ thread.
- **Implementation note:** Batch per thread; one alert per new inbound thread, not per message in a rapid exchange.

### 30. HQ: New Provider Application
- **Key:** `hq_new_provider_application`
- **Audience:** HQ staff (network reviewer)
- **Trigger:** A provider application is submitted
- **Subject:** New provider application: {{provider_name}}
- **Preview:** {{provider_service_type}}{{#if provider_company}} - {{provider_company}}{{/if}}
- **Heading:** New application to review

**Body:**

A new provider application is in the queue.

**Applicant:** {{provider_name}}{{#if provider_company}} ({{provider_company}}){{/if}}
{{#if provider_service_type}}**Services:** {{provider_service_type}}{{/if}}
**Submitted:** {{application_submitted_at}}
**Reference:** {{application_id}}

Review the application and move it to a decision or a follow-up request.

- **Primary CTA:** Review Application -> `{{application_url}}`
- **Variables:** `{{provider_name}}` applicant; `{{provider_company}}` business (optional); `{{provider_service_type}}` services (optional); `{{application_submitted_at}}` submission time; `{{application_id}}` reference; `{{application_url}}` HQ review page.
- **Implementation note:** Pairs with applicant-facing template 3; both fire on the same event.

### 31. HQ: Property Guest Ready
- **Key:** `hq_property_guest_ready`
- **Audience:** HQ staff (property operations)
- **Trigger:** A property is marked guest-ready
- **Subject:** Guest ready: {{property_name}}
- **Preview:** Marked ready{{#if guest_arrival_time}} ahead of {{guest_arrival_time}} arrival{{/if}}.
- **Heading:** Property marked guest ready

**Body:**

{{property_name}} ({{property_address}}) has been marked guest ready{{#if assigned_provider_name}} by {{assigned_provider_name}}{{/if}}.

{{#if guest_arrival_time}}**Guest arrival:** {{guest_arrival_time}}{{/if}}
{{#if completion_time}}**Marked ready:** {{completion_time}}{{/if}}

Spot-check the completion documentation if this booking warrants it; otherwise no action is needed.

- **Primary CTA:** View Completion Details -> `{{property_url}}`
- **Variables:** `{{property_name}}` property; `{{property_address}}` address; `{{assigned_provider_name}}` who completed it (optional); `{{guest_arrival_time}}` arrival (optional); `{{completion_time}}` ready timestamp (optional); `{{property_url}}` turnover/property record.
- **Implementation note:** Low-urgency; safe to batch into a digest if volume grows.

### 32. HQ: Property Supply Low
- **Key:** `hq_property_supply_low`
- **Audience:** HQ staff (property operations)
- **Trigger:** A supply item is reported at or below its low threshold
- **Subject:** Supply low at {{property_name}}: {{supply_item}}
- **Preview:** Reported level: {{supply_level}}.
- **Heading:** Supply running low

**Body:**

A low supply level was reported at {{property_name}}.

**Item:** {{supply_item}}
**Reported level:** {{supply_level}}
**Property:** {{property_address}}

Arrange restocking before the next turnover. This alert reports the level only; no order has been placed.

- **Primary CTA:** Arrange Restock -> `{{restock_url}}`
- **Variables:** `{{property_name}}` property; `{{property_address}}` address; `{{supply_item}}` item; `{{supply_level}}` reported level; `{{restock_url}}` restock workflow.
- **Implementation note:** The "no order has been placed" line is load-bearing; keep it unless auto-ordering ships.

### 33. HQ: Provider Approved
- **Key:** `hq_provider_approved`
- **Audience:** HQ staff (network operations)
- **Trigger:** A provider application is approved
- **Subject:** Provider approved: {{provider_name}}
- **Preview:** Now eligible for matching{{#if provider_service_type}} in {{provider_service_type}}{{/if}}.
- **Heading:** Provider approved

**Body:**

{{provider_name}}{{#if provider_company}} ({{provider_company}}){{/if}} has been approved{{#if provider_service_type}} for {{provider_service_type}}{{/if}}.

They are now eligible for assignment matching once onboarding completes. Confirm their profile, coverage area, and any outstanding onboarding items.

- **Primary CTA:** Open Provider Profile -> `{{application_url}}`
- **Variables:** `{{provider_name}}` provider; `{{provider_company}}` business (optional); `{{provider_service_type}}` approved services (optional); `{{application_url}}` HQ provider profile.
- **Implementation note:** Fires alongside provider-facing template 4.

### 34. HQ: Trusted Contact Invitation Expired
- **Key:** `hq_trusted_contact_invitation_expired`
- **Audience:** HQ staff (client operations)
- **Trigger:** A trusted contact invitation lapses unaccepted
- **Subject:** Invitation expired: trusted contact for {{client_name}}
- **Preview:** {{trusted_contact_name}} did not respond in time.
- **Heading:** Trusted contact invite expired

**Body:**

The trusted contact invitation from {{client_name}} to {{trusted_contact_name}} expired{{#if invitation_expires_at}} on {{invitation_expires_at}}{{/if}} without a response.

The client has been notified and can reissue it. No HQ action is required unless the client asks for help; this alert is for awareness on the account timeline.

- **Primary CTA:** View Client Account -> `{{portal_url}}`
- **Variables:** `{{client_name}}` inviting client; `{{trusted_contact_name}}` invitee; `{{invitation_expires_at}}` expiry date (optional); `{{portal_url}}` HQ client record.
- **Implementation note:** Consider digesting these; individually they are low urgency.

### 35. HQ: Turnover at Risk
- **Key:** `hq_turnover_at_risk`
- **Audience:** HQ staff (property operations) - highest priority alert
- **Trigger:** A turnover is flagged at risk against guest arrival
- **Subject:** AT RISK: {{property_name}} turnover
- **Preview:** {{risk_reason}}{{#if guest_arrival_time}} - guest arrives {{guest_arrival_time}}{{/if}}.
- **Heading:** Turnover at risk

**Body:**

The turnover at {{property_name}} is at risk.

**Property:** {{property_address}}
**Turnover:** {{turnover_id}}{{#if turnover_date}}, {{turnover_date}}{{/if}}
**Risk:** {{risk_reason}}
{{#if guest_arrival_time}}**Guest arrival:** {{guest_arrival_time}}{{/if}}
{{#if resolution_status}}**Current status:** {{resolution_status}}{{/if}}

Act now: reassign, escalate, or confirm recovery directly with the assigned provider. Update the turnover record so the next person sees the current state.

- **Primary CTA:** Review Turnover -> `{{property_url}}`
- **Variables:** `{{property_name}}` property; `{{property_address}}` address; `{{turnover_id}}` reference; `{{turnover_date}}` date (optional); `{{risk_reason}}` why it is at risk; `{{guest_arrival_time}}` deadline (optional); `{{resolution_status}}` mitigation state (optional); `{{property_url}}` turnover record.
- **Implementation note:** Highest-priority channel available (push + email). Never batch.

### 36. HQ: Turnover Issue Reported
- **Key:** `hq_turnover_issue_reported`
- **Audience:** HQ staff (property operations)
- **Trigger:** A provider reports an issue during a turnover
- **Subject:** Issue at {{property_name}}: {{issue_summary}}
- **Preview:** Reported during turnover {{turnover_id}}.
- **Heading:** Turnover issue reported

**Body:**

An issue was reported during the turnover at {{property_name}}.

**Issue:** {{issue_summary}}
**Turnover:** {{turnover_id}}
{{#if assigned_provider_name}}**Reported by:** {{assigned_provider_name}}{{/if}}
{{#if guest_ready_status}}**Can the turnover continue:** {{guest_ready_status}}{{/if}}

Review the report and decide the response: dispatch help, adjust scope, or clear it as handled. The reporter is waiting on direction.

- **Primary CTA:** Respond to Issue -> `{{issue_url}}`
- **Variables:** `{{property_name}}` property; `{{issue_summary}}` problem description; `{{turnover_id}}` reference; `{{assigned_provider_name}}` reporter (optional); `{{guest_ready_status}}` continue yes/no (optional); `{{issue_url}}` issue record.
- **Implementation note:** If severity is high or continue=no, escalate to the at-risk pathway (template 35) as well.

### 37. HQ: Turnover Scheduled
- **Key:** `hq_turnover_scheduled`
- **Audience:** HQ staff (property operations)
- **Trigger:** A turnover is scheduled
- **Subject:** Turnover scheduled: {{property_name}}, {{turnover_date}}
- **Preview:** {{#if assigned_provider_name}}Assigned to {{assigned_provider_name}}.{{/if}}{{#unless assigned_provider_name}}Not yet assigned.{{/unless}}
- **Heading:** Turnover on the board

**Body:**

A turnover has been scheduled.

**Property:** {{property_name}}, {{property_address}}
**Date:** {{turnover_date}}{{#if turnover_time}} at {{turnover_time}}{{/if}}
{{#if guest_arrival_time}}**Guest arrival:** {{guest_arrival_time}}{{/if}}
{{#if assigned_provider_name}}**Assigned:** {{assigned_provider_name}}{{/if}}{{#unless assigned_provider_name}}**Assigned:** not yet - needs assignment{{/unless}}

{{#if assigned_provider_name}}No action needed unless plans change.{{/if}}{{#unless assigned_provider_name}}Assign coverage before the window tightens.{{/unless}}

- **Primary CTA:** Review Turnover -> `{{property_url}}`
- **Variables:** `{{property_name}}` property; `{{property_address}}` address; `{{turnover_date}}` date; `{{turnover_time}}` start (optional); `{{guest_arrival_time}}` arrival (optional); `{{assigned_provider_name}}` provider if assigned (optional); `{{property_url}}` turnover record.
- **Implementation note:** The `#if/#unless` pair flips this between "for awareness" and "needs assignment" from one template.

---

## Operational and recipient notifications

Recipient-facing counterparts to the operational events. Each entry names its audience explicitly.

### 38. Application Needs Follow-Up
- **Key:** `application_needs_follow_up`
- **Audience:** Provider / vendor applicant
- **Trigger:** Review pauses because the applicant must supply something
- **Subject:** Your application needs one more thing
- **Preview:** A quick addition will keep your review moving.
- **Heading:** Almost there

**Body:**

Hi {{recipient_first_name}},

Thanks for your patience while we review your application{{#if application_id}} ({{application_id}}){{/if}}. We need one thing from you before we can continue:

**Needed:** {{issue_summary}}
{{#if follow_up_deadline}}**Please provide it by:** {{follow_up_deadline}}{{/if}}

You can add it directly through your application page. Once it is in, review picks up where it left off; this request is a normal part of the process, not a bad sign.

If anything about the request is unclear, reply to this email and we will explain what we are looking for.

- **Primary CTA:** Update Application -> `{{application_url}}`
- **Variables:** `{{recipient_first_name}}` applicant first name; `{{application_id}}` reference (optional); `{{issue_summary}}` what is needed; `{{follow_up_deadline}}` provide-by date (optional); `{{application_url}}` application page.
- **Implementation note:** Fires with HQ template 23 when the trigger is a needs-info status change.

### 39. Appointment Scheduled
- **Key:** `appointment_scheduled`
- **Audience:** Client (or the attending party)
- **Trigger:** An appointment is booked
- **Subject:** Confirmed: {{appointment_type}} on {{appointment_date}}
- **Preview:** Time, location, and what to expect.
- **Heading:** Your appointment is set

**Body:**

Hi {{recipient_first_name}},

Your appointment is confirmed.

**What:** {{appointment_type}}
**When:** {{appointment_date}} at {{appointment_time}}
**Where:** {{appointment_location}}
{{#if staff_name}}**With:** {{staff_name}}{{/if}}
{{#if service_notes}}**To prepare:** {{service_notes}}{{/if}}

If you need to reschedule, the earlier we know the easier it is; use the appointment page or reply to this email.

- **Primary CTA:** View Appointment -> `{{appointment_url}}`
- **Variables:** `{{recipient_first_name}}` attendee first name; `{{appointment_type}}` kind of appointment; `{{appointment_date}}` date; `{{appointment_time}}` time; `{{appointment_location}}` place or link; `{{staff_name}}` PMV attendee (optional); `{{service_notes}}` preparation notes (optional); `{{appointment_url}}` appointment detail.
- **Implementation note:** Attach a calendar invite (.ics) at send time; the platform already builds these.

### 40. Cleaner Assigned
- **Key:** `cleaner_assigned`
- **Audience:** Client / property owner
- **Trigger:** Cleaning coverage assigned to a job
- **Subject:** Cleaning coverage confirmed for {{property_name}}
- **Preview:** {{assigned_provider_name}} will handle your scheduled cleaning.
- **Heading:** Coverage is set

**Body:**

Hi {{recipient_first_name}},

Cleaning coverage for your upcoming service is confirmed.

**Property:** {{property_name}}{{#if property_address}}, {{property_address}}{{/if}}
**Date:** {{service_date}}{{#if service_window}} ({{service_window}}){{/if}}
**Assigned:** {{assigned_provider_name}}, an independent professional from the PMV network

We have briefed them on the property and scope, and we track the job from arrival through completion. You do not need to coordinate anything directly; if plans change on your side, tell us and we will handle the rest.

- **Primary CTA:** View Booking -> `{{assignment_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{property_name}}` property; `{{property_address}}` address (optional); `{{service_date}}` date; `{{service_window}}` window (optional); `{{assigned_provider_name}}` assigned cleaner; `{{assignment_url}}` booking detail.
- **Implementation note:** "Independent professional from the PMV network" is the required framing; do not describe the cleaner as staff.

### 41. Cleaning Booking Received
- **Key:** `cleaning_booking_received`
- **Audience:** Client / requester
- **Trigger:** A cleaning request is submitted
- **Subject:** We received your cleaning request
- **Preview:** Received and in scheduling - confirmation to follow.
- **Heading:** Request received

**Body:**

Hi {{recipient_first_name}},

Your cleaning request is in.

**Property:** {{property_name}}{{#if property_address}}, {{property_address}}{{/if}}
{{#if service_date}}**Requested date:** {{service_date}}{{/if}}
{{#if service_type}}**Service:** {{service_type}}{{/if}}

To set expectations: this confirms we received the request, and scheduling comes next. We will match coverage and send a separate confirmation with the final date, window, and assigned professional. If anything about the request changes in the meantime, reply here.

- **Primary CTA:** View Request -> `{{assignment_url}}`
- **Variables:** `{{recipient_first_name}}` requester first name; `{{property_name}}` property; `{{property_address}}` address (optional); `{{service_date}}` requested date (optional); `{{service_type}}` cleaning type (optional); `{{assignment_url}}` request status page.
- **Implementation note:** Keep receipt and scheduling strictly separate; template 44 is the scheduling confirmation.

### 42. Cleaning Completed
- **Key:** `cleaning_completed`
- **Audience:** Client / property owner
- **Trigger:** Cleaning marked complete
- **Subject:** Cleaning complete at {{property_name}}
- **Preview:** Completion details and documentation are ready.
- **Heading:** All done

**Body:**

Hi {{recipient_first_name}},

The cleaning at {{property_name}} has been reported complete{{#if completion_time}} as of {{completion_time}}{{/if}}.

{{#if completion_notes}}**Notes from the visit:** {{completion_notes}}{{/if}}

Where documentation was captured (photos, checklist, timestamps), you will find it with the job record. If anything does not meet your expectations, tell us within a day or two while details are fresh; report it from the job page or reply to this email and we will coordinate the follow-up.

- **Primary CTA:** View Completion Details -> `{{assignment_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{property_name}}` property; `{{completion_time}}` completion timestamp (optional); `{{completion_notes}}` provider notes (optional); `{{assignment_url}}` job record with documentation.
- **Implementation note:** "Reported complete" is deliberate wording; PMV relays the report rather than certifying the outcome.

### 43. Cleaning Issue Reported
- **Key:** `cleaning_issue_reported`
- **Audience:** Client / property owner
- **Trigger:** An issue is logged against a cleaning job
- **Subject:** An issue was reported at {{property_name}}
- **Preview:** What was reported and how we are handling it.
- **Heading:** We're on it

**Body:**

Hi {{recipient_first_name}},

An issue was reported in connection with the cleaning at {{property_name}}, and we want you to hear it from us first.

**Reported:** {{issue_summary}}

PMV is coordinating the review: we are gathering the details, and we will come back to you with what we find and the proposed next step{{#if follow_up_deadline}} by {{follow_up_deadline}}{{/if}}. You can follow the status or add information from the issue page.

If you have photos or context that would help, adding them now speeds everything up.

- **Primary CTA:** View Issue -> `{{issue_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{property_name}}` property; `{{issue_summary}}` issue description; `{{follow_up_deadline}}` promised update date, only when actually set (optional); `{{issue_url}}` issue record.
- **Implementation note:** Only populate `{{follow_up_deadline}}` when staff commit to a date; otherwise the sentence ends at "next step."

### 44. Cleaning Scheduled
- **Key:** `cleaning_scheduled`
- **Audience:** Client / requester
- **Trigger:** Cleaning confirmed onto the schedule
- **Subject:** Cleaning scheduled: {{service_date}} at {{property_name}}
- **Preview:** Date, window, and how to prepare.
- **Heading:** You're on the schedule

**Body:**

Hi {{recipient_first_name}},

Your cleaning is scheduled.

**Property:** {{property_name}}{{#if property_address}}, {{property_address}}{{/if}}
**Date:** {{service_date}}
{{#if service_window}}**Window:** {{service_window}}{{/if}}
{{#if service_type}}**Service:** {{service_type}}{{/if}}
{{#if service_notes}}**To prepare:** {{service_notes}}{{/if}}

{{#if assigned_provider_name}}Coverage is assigned to {{assigned_provider_name}} from the PMV network.{{/if}}{{#unless assigned_provider_name}}We are finalizing coverage and will confirm the assigned professional separately.{{/unless}} If the date stops working for you, let us know as early as you can.

- **Primary CTA:** View Booking -> `{{assignment_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{property_name}}` property; `{{property_address}}` address (optional); `{{service_date}}` confirmed date; `{{service_window}}` arrival window (optional); `{{service_type}}` cleaning type (optional); `{{service_notes}}` preparation instructions (optional); `{{assigned_provider_name}}` cleaner if assigned (optional); `{{assignment_url}}` booking detail.
- **Implementation note:** The `#if/#unless` pair keeps this honest whether or not coverage is assigned at confirmation time.

### 45. Client Inactive for 30 Days
- **Key:** `client_inactive_30_days`
- **Audience:** Client
- **Trigger:** 30 days without portal activity or requests
- **Subject:** Still here when you need us
- **Preview:** A quick reminder of what your account can take off your plate.
- **Heading:** No news is fine news

**Body:**

Hi {{recipient_first_name}},

It has been a little while since you used your Pinnacle account, which usually just means life is running smoothly. This is not a "we miss you" guilt trip; it is a simple reminder of what is on standby.

Whenever something comes up (a property that needs eyes on it, paperwork that needs handling, an operational project without an owner, or a task that just needs a capable person), your portal is the fastest way to hand it to us. One request in plain language is enough to start.

Nothing is required from you, and your account stays exactly as you left it{{#if support_phone}}. Prefer to talk it through? Call {{support_phone}}{{/if}}.

- **Primary CTA:** Open Your Portal -> `{{portal_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{portal_url}}` portal home; `{{support_phone}}` firm phone (optional).
- **Implementation note:** Send at most once per inactivity period; do not stack with the nurture sequence.

### 46. Invoice Due Reminder
- **Key:** `invoice_due_reminder`
- **Audience:** Client
- **Trigger:** Invoice approaching or reaching its due date, unpaid
- **Subject:** Reminder: invoice {{invoice_number}} is due {{invoice_due_date}}
- **Preview:** Balance and secure payment link inside.
- **Heading:** A friendly heads-up

**Body:**

Hi {{recipient_first_name}},

A quick reminder that an invoice on your account is coming due.

**Invoice:** {{invoice_number}}
**Balance:** {{invoice_balance}}
**Due:** {{invoice_due_date}}

If you have already paid, thank you, and you can disregard this; payments can take a short while to reflect. Otherwise you can settle it securely in a couple of minutes through the link below.

Questions about the charges? Reply to this email{{#if support_email}} or write {{support_email}}{{/if}} and we will sort it out together.

- **Primary CTA:** Pay Invoice -> `{{payment_url}}`
- **Secondary CTA:** Review Invoice -> `{{invoice_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{invoice_number}}` reference; `{{invoice_balance}}` amount outstanding; `{{invoice_due_date}}` due date; `{{payment_url}}` payment page; `{{invoice_url}}` invoice detail; `{{support_email}}` billing contact (optional).
- **Implementation note:** Suppress automatically if payment posts between queueing and send.

### 47. Message Awaiting Response
- **Key:** `message_awaiting_response`
- **Audience:** Client, provider, or trusted contact with an unanswered message
- **Trigger:** A message to the recipient goes unread/unanswered past a threshold
- **Subject:** A message from {{sender_name}} is waiting for you
- **Preview:** Sent {{message_received_at}} - a reply would keep things moving.
- **Heading:** Waiting on your reply

**Body:**

Hi {{recipient_first_name}},

{{sender_name}} sent you a message that is still waiting for a response.

**Subject:** {{message_subject}}
**Sent:** {{message_received_at}}
{{#if message_preview}}**Preview:** {{message_preview}}{{/if}}

Some messages need your answer before work can continue, so a quick reply, even a brief one, keeps everything on track. You can read and respond securely from the link below.

- **Primary CTA:** View Message -> `{{message_url}}`
- **Variables:** `{{recipient_first_name}}` recipient first name; `{{sender_name}}` who is waiting; `{{message_subject}}` thread subject; `{{message_received_at}}` sent time; `{{message_preview}}` snippet (optional); `{{message_url}}` secure thread link.
- **Implementation note:** Counterpart of HQ template 24; direction decides which fires.

### 48. New Client Registration
- **Key:** `new_client_registration`
- **Audience:** The newly registered client
- **Trigger:** Registration completed (pre-welcome or where welcome is separate)
- **Subject:** Registration confirmed
- **Preview:** Your account exists - one step remains.
- **Heading:** You're registered

**Body:**

Hi {{recipient_first_name}},

Your registration with Pinnacle Management Ventures is confirmed{{#if registration_date}} as of {{registration_date}}{{/if}}.

**Next step:** finish setting up your account so your portal is fully usable: confirm your details{{#if account_type}} for your {{account_type}} account{{/if}}, set your sign-in credentials if you have not, and take a first look around.

Everything after that happens at your pace. When you are ready to bring us something, the portal is where to start.

- **Primary CTA:** Complete Registration -> `{{registration_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{registration_date}}` registration date (optional); `{{account_type}}` account category (optional); `{{registration_url}}` setup/onboarding link.
- **Implementation note:** If the welcome (template 1) fires at the same moment, send only the welcome; this one is for split flows.

### 49. New Document Uploaded
- **Key:** `new_document_uploaded`
- **Audience:** Client (or the party the document concerns)
- **Trigger:** A document is added to the recipient's account
- **Subject:** A new document is in your portal
- **Preview:** {{document_name}}, added {{document_uploaded_at}}.
- **Heading:** New document available

**Body:**

Hi {{recipient_first_name}},

A new document has been added to your account.

**Document:** {{document_name}}{{#if document_type}} ({{document_type}}){{/if}}
**Added by:** {{document_uploaded_by}}
**Added:** {{document_uploaded_at}}
{{#if property_name}}**Related to:** {{property_name}}{{/if}}{{#if service_type}}{{#unless property_name}}**Related to:** {{service_type}}{{/unless}}{{/if}}

You can view it securely in your portal. If it needs your signature or a response, the document page will say so clearly; otherwise it is simply there for your records.

- **Primary CTA:** View Document -> `{{document_url}}`
- **Variables:** `{{recipient_first_name}}` recipient first name; `{{document_name}}` title; `{{document_type}}` category (optional); `{{document_uploaded_by}}` uploader display name; `{{document_uploaded_at}}` time; `{{property_name}}` related property (optional); `{{service_type}}` related service (optional); `{{document_url}}` secure portal link.
- **Implementation note:** Never attach the file to the email; the portal link is the only path.

### 50. New Invoice
- **Key:** `new_invoice`
- **Audience:** Client (billing contact)
- **Trigger:** Invoice created and released to the account
- **Subject:** A new invoice is on your account
- **Preview:** {{invoice_number}} for {{invoice_amount}} - review at your convenience.
- **Heading:** New invoice posted

**Body:**

Hi {{recipient_first_name}},

A new invoice has been posted to your account and is ready whenever you are.

**Invoice:** {{invoice_number}}
**Amount:** {{invoice_amount}}
{{#if invoice_due_date}}**Due:** {{invoice_due_date}}{{/if}}

The full breakdown is on the invoice itself. Review it at your convenience; if anything needs clarifying, we would rather answer a question now than have a surprise later.

- **Primary CTA:** Review Invoice -> `{{invoice_url}}`
- **Secondary CTA:** Pay Invoice -> `{{payment_url}}`
- **Variables:** `{{recipient_first_name}}` billing contact first name; `{{invoice_number}}` reference; `{{invoice_amount}}` total; `{{invoice_due_date}}` due date (optional); `{{invoice_url}}` invoice detail; `{{payment_url}}` payment page.
- **Implementation note:** Use template 13 for the standard flow; this lighter variant suits accounts on consolidated billing.

### 51. New Lead or Prospect
- **Key:** `new_lead_or_prospect`
- **Audience:** Assigned staff member
- **Trigger:** A lead is assigned to a specific owner
- **Subject:** Lead assigned to you: {{lead_name}}
- **Preview:** From {{lead_source}} - first contact is yours.
- **Heading:** You own this lead

**Body:**

Hi {{recipient_first_name}},

A new lead has been assigned to you.

**Name:** {{lead_name}}
{{#if lead_email}}**Email:** {{lead_email}}{{/if}}
{{#if lead_phone}}**Phone:** {{lead_phone}}{{/if}}
**Source:** {{lead_source}}
{{#if lead_service_interest}}**Asking about:** {{lead_service_interest}}{{/if}}

First contact within the first hours makes the biggest difference. Reach out, then log the outcome on the lead record so the pipeline stays truthful.

- **Primary CTA:** Open Lead -> `{{lead_url}}`
- **Variables:** `{{recipient_first_name}}` assignee first name; `{{lead_name}}` lead; `{{lead_email}}` email (optional); `{{lead_phone}}` phone (optional); `{{lead_source}}` origin; `{{lead_service_interest}}` interest (optional); `{{lead_url}}` lead record.
- **Implementation note:** Differs from HQ template 28 (broadcast) by being personal-assignment; send one or the other, not both.

### 52. New Message
- **Key:** `new_message`
- **Audience:** Client, provider, or trusted contact
- **Trigger:** A new secure message arrives for the recipient
- **Subject:** New message from {{sender_name}}
- **Preview:** {{message_preview}}
- **Heading:** You have a new message

**Body:**

Hi {{recipient_first_name}},

{{sender_name}} sent you a message through your Pinnacle portal{{#if message_received_at}} at {{message_received_at}}{{/if}}.

{{#if message_subject}}**Subject:** {{message_subject}}{{/if}}
{{#if message_preview}}**Preview:** {{message_preview}}{{/if}}

For your security, the full message stays inside the portal rather than in email. Read and reply from the link below.

- **Primary CTA:** View Message -> `{{message_url}}`
- **Variables:** `{{recipient_first_name}}` recipient first name; `{{sender_name}}` sender display name; `{{message_received_at}}` arrival time (optional); `{{message_subject}}` subject (optional); `{{message_preview}}` short snippet (optional); `{{message_url}}` secure thread.
- **Implementation note:** Cap `{{message_preview}}` around 120 characters and strip markup before insertion.

### 53. New Provider Application
- **Key:** `new_provider_application`
- **Audience:** Provider applicant (submission confirmation for referral/assisted flows)
- **Trigger:** An application is submitted on the applicant's behalf or via an assisted flow
- **Subject:** Your provider application is in
- **Preview:** Submitted and queued for review.
- **Heading:** Application submitted

**Body:**

Hi {{recipient_first_name}},

Your provider application with Pinnacle Management Ventures has been submitted{{#if application_submitted_at}} on {{application_submitted_at}}{{/if}}{{#if application_id}} under reference {{application_id}}{{/if}}.

It is now queued for individual review. If anything needs clarification we will contact you, so keep an eye on this inbox. Submission confirms receipt only; it is not a decision, and there is nothing further you need to do right now.

You can check where things stand at any time from your application page.

- **Primary CTA:** Review Application Status -> `{{application_url}}`
- **Variables:** `{{recipient_first_name}}` applicant first name; `{{application_submitted_at}}` submission time (optional); `{{application_id}}` reference (optional); `{{application_url}}` status page.
- **Implementation note:** Use template 3 for the self-serve flow; this variant fits assisted or imported submissions. Do not send both.

### 54. Property Guest Ready
- **Key:** `property_guest_ready`
- **Audience:** Client / property owner
- **Trigger:** The property is marked ready for guest arrival
- **Subject:** {{property_name}} is guest ready
- **Preview:** Prepared and confirmed{{#if guest_arrival_time}} ahead of {{guest_arrival_time}}{{/if}}.
- **Heading:** Ready for arrival

**Body:**

Hi {{recipient_first_name}},

Good news: {{property_name}} has been marked ready for guest arrival{{#if completion_time}} as of {{completion_time}}{{/if}}.

{{#if guest_arrival_time}}**Guest arrival:** {{guest_arrival_time}}{{/if}}
{{#if completion_notes}}**Notes:** {{completion_notes}}{{/if}}

Where the visit captured documentation (photos, checklist, timestamps), it is attached to the turnover record for your review. Nothing is needed from you; this is confirmation that the handoff is set.

- **Primary CTA:** View Completion Details -> `{{property_url}}`
- **Variables:** `{{recipient_first_name}}` owner first name; `{{property_name}}` property; `{{completion_time}}` ready timestamp (optional); `{{guest_arrival_time}}` arrival time (optional); `{{completion_notes}}` visit notes (optional); `{{property_url}}` turnover record.
- **Implementation note:** Pairs with HQ template 31; both fire on the ready event.

### 55. Property Supply Low
- **Key:** `property_supply_low`
- **Audience:** Client / property owner (when the owner handles restocking)
- **Trigger:** A supply item is reported low at the owner's property
- **Subject:** Running low at {{property_name}}: {{supply_item}}
- **Preview:** Reported level and the restock action.
- **Heading:** Time to restock

**Body:**

Hi {{recipient_first_name}},

During recent work at {{property_name}}, a supply item was reported as running low.

**Item:** {{supply_item}}
**Reported level:** {{supply_level}}

To be clear, this is a report, not an order; nothing has been purchased. If you would like PMV to arrange restocking, start it from the link below, or restock it yourself and mark it handled so the record stays accurate before the next visit.

- **Primary CTA:** Arrange Restock -> `{{restock_url}}`
- **Variables:** `{{recipient_first_name}}` owner first name; `{{property_name}}` property; `{{supply_item}}` item; `{{supply_level}}` reported level; `{{restock_url}}` restock workflow.
- **Implementation note:** Only send to owners whose properties are configured for owner-managed supplies; otherwise HQ template 32 handles it internally.

### 56. Provider Approved
- **Key:** `provider_approved`
- **Audience:** Staff member who referred/sponsored the provider (or a client awaiting the provider)
- **Trigger:** A watched provider application flips to approved
- **Subject:** {{provider_name}} has been approved
- **Preview:** The application you were following cleared review.
- **Heading:** Approved and onboarding

**Body:**

Hi {{recipient_first_name}},

An update on an application you were following: {{provider_name}}{{#if provider_company}} of {{provider_company}}{{/if}} has been approved for the PMV network{{#if provider_service_type}} in {{provider_service_type}}{{/if}}.

They are completing onboarding next, after which they become eligible for matching where their services, area, and availability fit. As always, approval opens the door; it does not commit any particular assignment.

Nothing is required from you; this closes the loop on the referral.

- **Primary CTA:** View Provider -> `{{application_url}}`
- **Variables:** `{{recipient_first_name}}` watcher first name; `{{provider_name}}` provider; `{{provider_company}}` business (optional); `{{provider_service_type}}` services (optional); `{{application_url}}` provider profile.
- **Implementation note:** Send only to explicit watchers/referrers; the provider gets template 4 and HQ gets 33.

### 57. Service Application Approved
- **Key:** `service_application_approved`
- **Audience:** Client
- **Trigger:** A client's application for a PMV service is approved
- **Subject:** You're approved: {{service_type}}
- **Preview:** What happens next with your service.
- **Heading:** Your service is approved

**Body:**

Hi {{recipient_first_name}},

Your application for {{service_type}} has been approved.

**What happens next:** {{#if service_notes}}{{service_notes}}{{/if}}{{#unless service_notes}}we set up the service on your account, and your portal becomes the home for its requests, schedules, documents, and updates. If scheduling or additional details are needed, we will reach out to arrange them.{{/unless}}

You will see the service reflected in your portal shortly. Questions in the meantime? Just reply; a person reads these.

- **Primary CTA:** Open Your Portal -> `{{portal_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{service_type}}` approved service; `{{service_notes}}` service-specific next step, overrides the generic one (optional); `{{portal_url}}` portal home.
- **Implementation note:** Populate `{{service_notes}}` per service where flows differ; the generic fallback keeps the template safe everywhere.

### 58. Service Application Submitted
- **Key:** `service_application_submitted`
- **Audience:** Client
- **Trigger:** A client submits a service application
- **Subject:** We received your {{service_type}} application
- **Preview:** In review now - here is what to expect.
- **Heading:** Application in review

**Body:**

Hi {{recipient_first_name}},

Thanks - your application for {{service_type}} has been received and is in review.

We look at each application against the service's requirements, and if we need anything else from you we will ask directly. This confirmation means the application arrived; the decision comes separately once review is complete.

You can follow the status any time from your portal.

- **Primary CTA:** View Application Status -> `{{application_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{service_type}}` requested service; `{{application_url}}` status page.
- **Implementation note:** Keep this short; the decision email (template 57) carries the substance.

### 59. Service Assigned
- **Key:** `service_assigned`
- **Audience:** Client
- **Trigger:** A service request is assigned for execution
- **Subject:** Your request is assigned and moving
- **Preview:** Who is handling it and what happens next.
- **Heading:** Assigned and in motion

**Body:**

Hi {{recipient_first_name}},

Your service request is assigned and moving forward.

**Request:** {{service_request_id}}{{#if service_type}} ({{service_type}}){{/if}}
{{#if service_address}}**Location:** {{service_address}}{{/if}}
{{#if service_date}}**Scheduled:** {{service_date}}{{#if service_window}}, {{service_window}}{{/if}}{{/if}}
{{#if assigned_provider_name}}**Handled by:** {{assigned_provider_name}}, coordinated by PMV{{/if}}

We have set the scope and expectations, and we track the work through completion. {{#if service_notes}}One thing on your side: {{service_notes}}{{/if}}{{#unless service_notes}}Nothing is needed from you right now; we will update you as it progresses.{{/unless}}

- **Primary CTA:** View Assignment -> `{{assignment_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{service_request_id}}` request reference; `{{service_type}}` work type (optional); `{{service_address}}` location (optional); `{{service_date}}` date (optional); `{{service_window}}` window (optional); `{{assigned_provider_name}}` assigned professional (optional); `{{service_notes}}` client-side action if any (optional); `{{assignment_url}}` request detail.
- **Implementation note:** "Coordinated by PMV" frames the provider correctly without an employment claim.

### 60. Service Completed
- **Key:** `service_completed`
- **Audience:** Client
- **Trigger:** A service request is marked complete
- **Subject:** Done: your {{service_type}} request is complete
- **Preview:** The result, the record, and how to flag anything.
- **Heading:** Request complete

**Body:**

Hi {{recipient_first_name}},

Your request has been reported complete.

**Request:** {{service_request_id}}{{#if service_type}} ({{service_type}}){{/if}}
{{#if completion_time}}**Completed:** {{completion_time}}{{/if}}
{{#if completion_notes}}**Summary:** {{completion_notes}}{{/if}}

The full record, including any photos, documents, and timestamps captured along the way, is saved with the request for whenever you need it.

If the result is not what you expected, tell us soon while the details are fresh: raise it from the request page or reply to this email, and we will coordinate the follow-up.

- **Primary CTA:** View Completion Details -> `{{assignment_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{service_request_id}}` reference; `{{service_type}}` work type (optional); `{{completion_time}}` completion timestamp (optional); `{{completion_notes}}` summary (optional); `{{assignment_url}}` request record.
- **Implementation note:** This is the natural place to later append an optional feedback prompt; leave the core copy stable.

### 61. Trusted Contact Accepted
- **Key:** `trusted_contact_accepted`
- **Audience:** Client (the account holder who invited)
- **Trigger:** The trusted contact accepts
- **Subject:** {{trusted_contact_name}} accepted your invitation
- **Preview:** Their trusted contact access is now active.
- **Heading:** Invitation accepted

**Body:**

Hi {{recipient_first_name}},

{{trusted_contact_name}} has accepted your trusted contact invitation{{#if trusted_contact_relationship}} as your {{trusted_contact_relationship}}{{/if}}, and their access is now active.

They can now see the specific items your trusted contact settings allow, and nothing more. You stay in control: you can review exactly what is shared, adjust it, or remove the access entirely at any time from your account settings.

No action is needed; this is simply your confirmation that the connection is live.

- **Primary CTA:** Review Access Settings -> `{{portal_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{trusted_contact_name}}` accepted contact; `{{trusted_contact_relationship}}` relationship (optional); `{{portal_url}}` trusted contact settings.
- **Implementation note:** Link straight to the trusted-contact settings pane, not the portal home.

### 62. Trusted Contact Invitation Expired
- **Key:** `trusted_contact_invitation_expired`
- **Audience:** Client (the account holder who invited)
- **Trigger:** The invitation lapses without a response
- **Subject:** Your trusted contact invitation expired
- **Preview:** No response in time - easy to resend if you like.
- **Heading:** Invitation expired

**Body:**

Hi {{recipient_first_name}},

The trusted contact invitation you sent to {{trusted_contact_name}} expired{{#if invitation_expires_at}} on {{invitation_expires_at}}{{/if}} before it was answered.

Invitations lapse automatically for security, and an expiry says nothing about their answer; people miss emails all the time. No access was granted, and nothing on your account changed.

If you would still like them connected, sending a fresh invitation takes a few seconds. It may also be worth a quick heads-up so they know to look for it.

- **Primary CTA:** Send a New Invitation -> `{{portal_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{trusted_contact_name}}` invitee; `{{invitation_expires_at}}` expiry date (optional); `{{portal_url}}` trusted contact settings.
- **Implementation note:** Fires with HQ template 34. Deliberately neutral about why there was no response.

### 63. Trusted Contact Invited
- **Key:** `trusted_contact_invited`
- **Audience:** Client (the account holder who invited)
- **Trigger:** The invitation is sent
- **Subject:** Your trusted contact invitation is on its way
- **Preview:** What happens once {{trusted_contact_name}} responds.
- **Heading:** Invitation sent

**Body:**

Hi {{recipient_first_name}},

Your trusted contact invitation to {{trusted_contact_name}}{{#if trusted_contact_relationship}} ({{trusted_contact_relationship}}){{/if}} has been sent.

**What happens next:** they will receive a secure email explaining the role and can accept or decline. The invitation{{#if invitation_expires_at}} expires {{invitation_expires_at}}{{/if}}; no access exists until they accept, and we will confirm with you either way once they respond or it lapses.

If you sent this to the wrong person or change your mind, you can cancel the invitation from your settings at any time.

- **Primary CTA:** View Invitation Status -> `{{portal_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{trusted_contact_name}}` invitee; `{{trusted_contact_relationship}}` relationship (optional); `{{invitation_expires_at}}` expiry (optional); `{{portal_url}}` trusted contact settings.
- **Implementation note:** The cancel affordance in copy requires the settings page to actually offer cancellation; it does.

### 64. Turnover at Risk
- **Key:** `turnover_at_risk`
- **Audience:** Client / property owner (owner-visible risk escalation)
- **Trigger:** A turnover is flagged at risk and owner awareness or a decision is needed
- **Subject:** Attention needed: {{property_name}} turnover
- **Preview:** {{risk_reason}} - here is where it stands.
- **Heading:** Turnover needs attention

**Body:**

Hi {{recipient_first_name}},

We want you to hear this from us early: the turnover at {{property_name}} is at risk, and we are actively working it.

**Turnover:** {{turnover_id}}{{#if turnover_date}}, {{turnover_date}}{{/if}}
**Risk:** {{risk_reason}}
{{#if guest_arrival_time}}**Guest arrival:** {{guest_arrival_time}}{{/if}}
{{#if resolution_status}}**Where it stands:** {{resolution_status}}{{/if}}

{{#if service_notes}}**What we need from you:** {{service_notes}}{{/if}}{{#unless service_notes}}Right now nothing is needed from you; we are handling recovery and will update you as soon as the picture changes.{{/unless}}

You can follow live status from the turnover page below.

- **Primary CTA:** Review Turnover -> `{{property_url}}`
- **Variables:** `{{recipient_first_name}}` owner first name; `{{property_name}}` property; `{{turnover_id}}` reference; `{{turnover_date}}` date (optional); `{{risk_reason}}` risk description; `{{guest_arrival_time}}` arrival (optional); `{{resolution_status}}` mitigation state (optional); `{{service_notes}}` owner decision/action needed, if any (optional); `{{property_url}}` turnover record.
- **Implementation note:** Only escalate to the owner when policy says so; HQ template 35 always fires first. Calm wording is intentional; do not add urgency theatrics.

### 65. Turnover Issue Reported
- **Key:** `turnover_issue_reported`
- **Audience:** Client / property owner
- **Trigger:** An issue is reported during their property's turnover
- **Subject:** Issue reported during the {{property_name}} turnover
- **Preview:** What was found and who is handling it.
- **Heading:** An issue came up

**Body:**

Hi {{recipient_first_name}},

During the turnover at {{property_name}} (turnover {{turnover_id}}), an issue was reported:

**Reported:** {{issue_summary}}

PMV is coordinating the response. {{#if service_notes}}We need one thing from you: {{service_notes}}{{/if}}{{#unless service_notes}}At the moment we do not need anything from you; our team is reviewing it and will follow up with the outcome or any decision that is yours to make.{{/unless}}

The issue page has the full detail, including any photos captured on site, and is the best place to add context if you have it.

- **Primary CTA:** View Issue -> `{{issue_url}}`
- **Variables:** `{{recipient_first_name}}` owner first name; `{{property_name}}` property; `{{turnover_id}}` reference; `{{issue_summary}}` problem description; `{{service_notes}}` owner action if required (optional); `{{issue_url}}` issue record.
- **Implementation note:** HQ template 36 fires in parallel; keep the owner version free of internal routing detail.

### 66. Turnover Scheduled
- **Key:** `turnover_scheduled`
- **Audience:** Client / property owner
- **Trigger:** A turnover is confirmed onto the schedule
- **Subject:** Turnover set for {{property_name}} on {{turnover_date}}
- **Preview:** Window, coverage, and anything to prepare.
- **Heading:** Turnover scheduled

**Body:**

Hi {{recipient_first_name}},

The turnover at {{property_name}} is on the schedule.

**Date:** {{turnover_date}}{{#if turnover_time}} at {{turnover_time}}{{/if}}
{{#if service_window}}**Window:** {{service_window}}{{/if}}
{{#if guest_arrival_time}}**Guest arrival:** {{guest_arrival_time}}{{/if}}
{{#if assigned_provider_name}}**Coverage:** {{assigned_provider_name}}, coordinated by PMV{{/if}}{{#unless assigned_provider_name}}**Coverage:** being finalized - we will confirm the assigned professional separately{{/unless}}
{{#if service_notes}}**To prepare:** {{service_notes}}{{/if}}

We will track the work through guest-ready and let you know when it is done. If dates shift on your side, tell us as early as possible so we can adjust coverage.

- **Primary CTA:** Review Turnover -> `{{property_url}}`
- **Variables:** `{{recipient_first_name}}` owner first name; `{{property_name}}` property; `{{turnover_date}}` date; `{{turnover_time}}` start (optional); `{{service_window}}` window (optional); `{{guest_arrival_time}}` arrival (optional); `{{assigned_provider_name}}` provider if assigned (optional); `{{service_notes}}` preparation items (optional); `{{property_url}}` turnover record.
- **Implementation note:** Mirrors HQ template 37 for the owner; the `#if/#unless` coverage pair keeps it honest pre-assignment.

---

## Recommended additions

Gaps the 66-template brief does not cover but the platform already generates events for (payments, e-sign, appointment lifecycle, security). Written to the same standard so they can ship together.

### 67. Payment Received
- **Key:** `payment_received`
- **Audience:** Client
- **Trigger:** A payment posts to an invoice
- **Subject:** Payment received - thank you
- **Preview:** Your receipt for invoice {{invoice_number}}.
- **Heading:** Payment confirmed

**Body:**

Hi {{recipient_first_name}},

Thank you - your payment has been received and applied.

**Invoice:** {{invoice_number}}
**Amount received:** {{invoice_amount}}
{{#if invoice_balance}}**Remaining balance:** {{invoice_balance}}{{/if}}
{{#if invoice_date}}**Payment date:** {{invoice_date}}{{/if}}

This email is your receipt; a copy also lives with the invoice in your portal. No action is needed{{#if invoice_balance}} beyond the remaining balance noted above{{/if}}.

- **Primary CTA:** View Receipt -> `{{invoice_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{invoice_number}}` reference; `{{invoice_amount}}` amount paid; `{{invoice_balance}}` remainder if partial (optional); `{{invoice_date}}` payment date (optional); `{{invoice_url}}` invoice/receipt page.
- **Implementation note:** Populate `{{invoice_balance}}` only when nonzero so full payments read cleanly.

### 68. Invoice Past Due
- **Key:** `invoice_past_due`
- **Audience:** Client
- **Trigger:** An invoice passes its due date unpaid
- **Subject:** Invoice {{invoice_number}} is past due
- **Preview:** Outstanding balance and the fastest way to resolve it.
- **Heading:** Let's get this settled

**Body:**

Hi {{recipient_first_name}},

Our records show an invoice on your account has passed its due date.

**Invoice:** {{invoice_number}}
**Balance:** {{invoice_balance}}
**Was due:** {{invoice_due_date}}

If payment is already on its way, thank you; it can take a short while to reflect. Otherwise the link below settles it in a couple of minutes.

If something is making payment difficult, or you believe this is in error, please tell us{{#if support_email}} at {{support_email}}{{/if}}. Talking to us early always beats letting it sit; we would much rather work something out.

- **Primary CTA:** Pay Invoice -> `{{payment_url}}`
- **Secondary CTA:** Review Invoice -> `{{invoice_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{invoice_number}}` reference; `{{invoice_balance}}` outstanding amount; `{{invoice_due_date}}` original due date; `{{payment_url}}` payment page; `{{invoice_url}}` invoice detail; `{{support_email}}` billing contact (optional).
- **Implementation note:** Firmer than template 46 but never threatening; escalation beyond this belongs to a human, not another template.

### 69. Quote Accepted
- **Key:** `quote_accepted`
- **Audience:** Client
- **Trigger:** Client accepts a quote
- **Subject:** Quote {{quote_number}} accepted - here's what happens next
- **Preview:** Your acceptance is recorded; work planning begins.
- **Heading:** Thank you - we're on it

**Body:**

Hi {{recipient_first_name}},

Your acceptance of quote {{quote_number}} ({{quote_amount}}) is recorded. Thank you for the go-ahead.

**What happens next:** we turn the quote into a working plan: confirming scope, lining up scheduling and the right people, and opening the request in your portal so you can follow progress from day one. If anything needs a decision from you along the way, we will ask directly.

A copy of the accepted quote is saved with your documents for reference.

- **Primary CTA:** Track Your Request -> `{{portal_url}}`
- **Secondary CTA:** View Accepted Quote -> `{{quote_url}}`
- **Variables:** `{{recipient_first_name}}` client first name; `{{quote_number}}` reference; `{{quote_amount}}` accepted total; `{{portal_url}}` request tracking; `{{quote_url}}` archived quote.
- **Implementation note:** Send immediately on acceptance; it doubles as the client's proof-of-acceptance record.

### 70. Quote Expiring Soon
- **Key:** `quote_expiring_reminder`
- **Audience:** Client or prospect
- **Trigger:** A quote nears its expiration date, unanswered
- **Subject:** Your quote expires {{quote_expiration_date}}
- **Preview:** A heads-up before the pricing window closes.
- **Heading:** Before this quote lapses

**Body:**

Hi {{recipient_first_name}},

A quick heads-up rather than a push: quote {{quote_number}} ({{quote_amount}}) is set to expire on {{quote_expiration_date}}.

Quotes carry an expiration so pricing stays accurate, not to pressure a decision. If you are ready, you can accept online before the date. If you need more time, want to adjust the scope, or have questions holding you back, reply and we will refresh or rework it; that is a normal part of the process.

And if plans changed and it is a no, that is useful to know too. No hard feelings.

- **Primary CTA:** Review Quote -> `{{quote_url}}`
- **Secondary CTA:** Accept Quote -> `{{accept_quote_url}}`
- **Variables:** `{{recipient_first_name}}` recipient first name; `{{quote_number}}` reference; `{{quote_amount}}` quoted total; `{{quote_expiration_date}}` expiry; `{{quote_url}}` quote detail; `{{accept_quote_url}}` acceptance action.
- **Implementation note:** Send once, roughly 3 days before expiry; never send after expiration.

### 71. Signature Requested
- **Key:** `signature_requested`
- **Audience:** Any signer (client, provider, trusted contact)
- **Trigger:** An e-sign envelope is sent to the recipient
- **Subject:** Signature requested: {{document_name}}
- **Preview:** Review and sign securely - the link is unique to you.
- **Heading:** A document needs your signature

**Body:**

Hi {{recipient_first_name}},

Pinnacle Management Ventures has sent you a document for review and signature.

**Document:** {{document_name}}
{{#if sender_name}}**From:** {{sender_name}}{{/if}}
{{#if message_preview}}**Note:** {{message_preview}}{{/if}}
{{#if invitation_expires_at}}**Link expires:** {{invitation_expires_at}}{{/if}}

The signing page walks you through it: verify your identity, review each page, and sign where indicated. It works equally well on a phone or computer, and your progress saves as you go.

Take the time you need to read before signing. If anything is unclear or looks wrong, reply to this email before you sign rather than after.

- **Primary CTA:** Review and Sign -> `{{document_url}}`
- **Variables:** `{{recipient_first_name}}` signer first name; `{{document_name}}` document title; `{{sender_name}}` requesting staff member (optional); `{{message_preview}}` sender's note (optional); `{{invitation_expires_at}}` link expiry (optional); `{{document_url}}` secure signing link.
- **Implementation note:** Maps to the platform's `sign_invitation` event; the signing link is single-recipient and must never be forwarded-safe.

### 72. Signature Reminder
- **Key:** `signature_reminder`
- **Audience:** A signer who has not completed
- **Trigger:** Reminder cadence on an open envelope
- **Subject:** Still waiting: {{document_name}} needs your signature
- **Preview:** A few minutes finishes it{{#if invitation_expires_at}} - link expires {{invitation_expires_at}}{{/if}}.
- **Heading:** A gentle nudge

**Body:**

Hi {{recipient_first_name}},

Just a reminder that {{document_name}} is still waiting for your signature.

{{#if invitation_expires_at}}**Your signing link expires:** {{invitation_expires_at}}{{/if}}

Signing takes only a few minutes, and anything you already filled in has been saved. If you have questions about the document, or something is stopping you from signing, reply to this email; a quick conversation now is better than a stalled document later.

If you have already signed, thank you; you can disregard this and the record will catch up shortly.

- **Primary CTA:** Review and Sign -> `{{document_url}}`
- **Variables:** `{{recipient_first_name}}` signer first name; `{{document_name}}` document title; `{{invitation_expires_at}}` link expiry (optional); `{{document_url}}` signing link.
- **Implementation note:** Maps to `sign_reminder`; cap reminder count in the envelope settings so this never becomes a drip.

### 73. Signature Completed
- **Key:** `signature_completed`
- **Audience:** All parties on the envelope
- **Trigger:** Every signer completes; the envelope finalizes
- **Subject:** Fully signed: {{document_name}}
- **Preview:** Your completed copy and signing record are ready.
- **Heading:** All signatures are in

**Body:**

Hi {{recipient_first_name}},

Good news: {{document_name}} is now fully signed by all parties{{#if completion_time}} as of {{completion_time}}{{/if}}.

The finalized document, together with its signing record (who signed, when, and the supporting audit evidence), is stored securely and available to you from the link below. It is worth saving a copy for your own files, though it will remain accessible in the portal.

Nothing further is needed; this completes the signing process.

- **Primary CTA:** View Signed Document -> `{{document_url}}`
- **Variables:** `{{recipient_first_name}}` party first name; `{{document_name}}` document title; `{{completion_time}}` finalization timestamp (optional); `{{document_url}}` completed document + evidence.
- **Implementation note:** Maps to `sign_completion`. One send per party; the link resolves to each party's authorized copy.

### 74. Appointment Reminder
- **Key:** `appointment_reminder`
- **Audience:** Client (or attending party)
- **Trigger:** A set interval before a confirmed appointment
- **Subject:** Tomorrow: {{appointment_type}} at {{appointment_time}}
- **Preview:** Time, location, and anything to bring.
- **Heading:** See you soon

**Body:**

Hi {{recipient_first_name}},

A reminder about your upcoming appointment.

**What:** {{appointment_type}}
**When:** {{appointment_date}} at {{appointment_time}}
**Where:** {{appointment_location}}
{{#if staff_name}}**With:** {{staff_name}}{{/if}}
{{#if service_notes}}**Bring / prepare:** {{service_notes}}{{/if}}

If the time no longer works, rescheduling now is easy and keeps the slot useful for someone else; use the appointment page or reply to this email. Otherwise, we look forward to it.

- **Primary CTA:** View Appointment -> `{{appointment_url}}`
- **Variables:** `{{recipient_first_name}}` attendee first name; `{{appointment_type}}` kind; `{{appointment_date}}` date; `{{appointment_time}}` time; `{{appointment_location}}` place or link; `{{staff_name}}` PMV attendee (optional); `{{service_notes}}` preparation items (optional); `{{appointment_url}}` appointment detail.
- **Implementation note:** Default to 24 hours before; adjust the subject's "Tomorrow" dynamically or use the date when the interval differs.

### 75. Appointment Updated or Canceled
- **Key:** `appointment_updated_or_canceled`
- **Audience:** Client (or attending party)
- **Trigger:** An appointment is rescheduled or canceled
- **Subject:** Change to your {{appointment_type}} appointment
- **Preview:** The updated details, clearly marked.
- **Heading:** Your appointment changed

**Body:**

Hi {{recipient_first_name}},

There has been a change to your {{appointment_type}} appointment{{#if service_notes}}: {{service_notes}}{{/if}}.

{{#if appointment_date}}**Now scheduled**
**When:** {{appointment_date}} at {{appointment_time}}
**Where:** {{appointment_location}}{{/if}}
{{#unless appointment_date}}**Status:** canceled. If this was unexpected or you would like to rebook, we are glad to help you find a new time.{{/unless}}

We apologize for any inconvenience a change causes. The appointment page always shows the current, authoritative details.

- **Primary CTA:** View Appointment -> `{{appointment_url}}`
- **Variables:** `{{recipient_first_name}}` attendee first name; `{{appointment_type}}` kind; `{{service_notes}}` one-line reason/summary of the change (optional); `{{appointment_date}}` new date, empty when canceled (optional); `{{appointment_time}}` new time (optional); `{{appointment_location}}` new place (optional); `{{appointment_url}}` appointment detail.
- **Implementation note:** Leaving `{{appointment_date}}` empty flips the template into its cancellation form; send an updated .ics alongside.

### 76. Password Changed
- **Key:** `password_changed`
- **Audience:** Any account holder
- **Trigger:** The account password is changed
- **Subject:** Your Pinnacle password was changed
- **Preview:** If this was you, no action is needed.
- **Heading:** Password updated

**Body:**

Hi {{recipient_first_name}},

The password for your Pinnacle account was changed{{#if request_time}} at {{request_time}}{{/if}}{{#if request_ip_address}} from IP {{request_ip_address}}{{/if}}.

**If this was you:** no action is needed; this note is just the record.

**If this was not you:** treat it as urgent. Reset your password immediately using the button below{{#if support_email}} and contact us at {{support_email}}{{/if}} so we can review the account with you.

- **Primary CTA:** Secure My Account -> `{{password_reset_url}}`
- **Variables:** `{{recipient_first_name}}` account holder first name; `{{request_time}}` change time (optional); `{{request_ip_address}}` originating IP (optional); `{{password_reset_url}}` recovery/reset entry; `{{support_email}}` security contact (optional).
- **Implementation note:** Always send, never suppressible by the user; it is the tamper alarm.

### 77. Provider Application Declined
- **Key:** `provider_application_declined`
- **Audience:** Provider / vendor applicant
- **Trigger:** Application review concludes without approval
- **Subject:** An update on your Pinnacle application
- **Preview:** The outcome of your network application.
- **Heading:** Thank you for applying

**Body:**

Hi {{recipient_first_name}},

Thank you for taking the time to apply to the Pinnacle Management Ventures professional network. After review, we are not able to move your application{{#if application_id}} ({{application_id}}){{/if}} forward at this time.

Decisions reflect our current needs, coverage, and fit{{#if issue_summary}}; in this case: {{issue_summary}}{{/if}}. They are not a judgment of your work overall, and our needs change as the network grows.

{{#if follow_up_deadline}}You are welcome to apply again after {{follow_up_deadline}}.{{/if}}{{#unless follow_up_deadline}}You are welcome to apply again in the future if your services or coverage change.{{/unless}}

We appreciate your interest and wish you well.

- **Primary CTA:** none - no action is required. Omit the button.
- **Variables:** `{{recipient_first_name}}` applicant first name; `{{application_id}}` reference (optional); `{{issue_summary}}` decline reason when policy shares one (optional); `{{follow_up_deadline}}` reapply-after date (optional).
- **Implementation note:** Only populate `{{issue_summary}}` from an approved reason list; free-text decline reasons should never flow into email.

---

## Final quality check

Verified against the brief before delivery:

- **All 66 briefed templates present**, in order, plus 11 recommended additions (67-77).
- **Both staff event templates** exist as distinct versions: announcement (7) and reminder/update (8).
- **Every template lists its variables**, each in `{{lowercase_snake_case}}` with double braces, and only the variables it uses.
- **Subjects and previews vary**; no repeated formula, and variables appear in subjects only where the result reads naturally.
- **Every CTA is specific** (Open Your Portal, Review Invoice, Respond to Issue, ...); no "Click Here." Template 77 correctly has no CTA.
- **No invented facts**: no prices, dates, policies, or availability outside variables; no licensing/vetting/insurance claims anywhere.
- **Independent providers are never called PMV employees**; templates 17, 40, 59, and 66 carry explicit independent/coordinated framing.
- **HQ alerts (23-37) are consistently shorter** than customer-facing messages.
- **The nurture sequence (15-21) progresses**: model -> scope -> people -> how to start -> hidden value -> the portal -> low-pressure close, with varied openings and CTAs.
- **Receipts never imply approval or final scheduling** (3, 41, 53, 58 all state it explicitly); **approval never promises assignments** (4, 33, 56).
- **Tone**: warm, capable, concise; no emojis, no exclamation-mark enthusiasm, no fake urgency (64 is calm by design).
- **The tagline appears selectively**: templates 1, 9, and 15 only.
