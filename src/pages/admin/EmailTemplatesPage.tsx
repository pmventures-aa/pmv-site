import { PageIntro } from '../../components/admin/ui'
import { EmailTemplatesPanel } from './EmailTemplatesPanel'

// Email copy as a first-class HQ destination.
//
// The same panel is still reachable as a tab inside Messages, so existing
// links and habits keep working. This route exists because with the whole
// catalog seeded it is a place people go on purpose, not something to stumble
// into while reading mail.
export default function EmailTemplatesPage() {
  return (
    <div className="space-y-4">
      <PageIntro
        kicker="Communications"
        title="Email Templates"
        subtitle="Every message Pinnacle sends. Edits apply to outbound mail immediately, and any system template can be restored to its shipped copy."
      />
      <EmailTemplatesPanel />
    </div>
  )
}
