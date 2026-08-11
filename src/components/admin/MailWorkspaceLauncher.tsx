// Deep-link chip that opens the dedicated Pinnacle mail + signing workspace
// in a new tab. Currently hidden in production because
// mail.pinnaclemanagementventures.com is not yet DNS-resolved - clicking
// the chip lands on a "This site can't be reached / DNS_PROBE_FINISHED_NXDOMAIN"
// page, which is a dead-end for staff. When the mail. subdomain is added
// to Cloudflare DNS + Pages custom domains (see DEPLOY.md), remove the
// early return below to re-enable the chip.

export function MailWorkspaceLauncher() {
  return null
}
