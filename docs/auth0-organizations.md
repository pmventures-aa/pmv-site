/**
 * Auth0 Organizations — deferred integration point
 *
 * The initial Auth0 rollout authenticates individual client-portal users only.
 * Pinnacle’s internal business, relationship, assignment, and trusted-contact
 * records remain the sole authorization source.
 *
 * Do not automatically create an Auth0 Organization for every Pinnacle client.
 *
 * Future work (if needed for genuine multi-user business clients):
 * - Map Auth0 Organization membership to an existing Pinnacle business party
 * - Keep automatic organization membership on login disabled by default
 * - Keep public organization signup disabled by default
 * - Require explicit invitation or HQ approval
 * - Never map Auth0 organization roles to granular Pinnacle resource permissions
 */

export {}
