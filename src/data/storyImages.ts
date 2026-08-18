// Image-slot architecture for the public site's visual storytelling.
//
// Photography is referenced by a stable *slot* name rather than a hard-coded
// path, so real production photos can be dropped in later by setting `src` on a
// slot - every page that uses the slot upgrades at once, with no component
// changes. Until a photo exists, the slot renders a tasteful brand-toned
// gradient "scene" (defined here, no binary assets shipped) so layouts are
// complete and never look broken.
//
// To add real photography later: place the file under /public (or import it)
// and set `src` on the matching slot. Keep `alt` accurate to the scene.

export interface StoryImageSlot {
  /** Real image URL once available; when null the gradient scene renders. */
  src: string | null
  /** Always-meaningful alt text describing the intended scene. */
  alt: string
  /** Brand-toned CSS gradient used as the placeholder scene. */
  scene: string
  /** Short label shown faintly on the placeholder to hint the intended shot. */
  hint: string
}

const NAVY_DEEP = '#0a1222'
const NAVY = '#111c30'
const GOLD = 'rgba(201,162,39,0.28)'

function scene(from: string, to: string, accentAt = '78% 18%'): string {
  return `radial-gradient(120% 90% at ${accentAt}, ${GOLD} 0%, transparent 42%), linear-gradient(158deg, ${from} 0%, ${to} 100%)`
}

// Slot keys are intentionally descriptive of the *scene*, not the page, so they
// can be reused across service pages.
export const storyImages = {
  field_inspection: { src: null, alt: 'A field professional documenting a property exterior on a phone', scene: scene(NAVY, NAVY_DEEP), hint: 'Field inspection' },
  property_exterior: { src: null, alt: 'Exterior of a residential property being inspected', scene: scene('#132038', NAVY_DEEP, '22% 20%'), hint: 'Property exterior' },
  property_interior: { src: null, alt: 'Interior walkthrough of a vacant property', scene: scene(NAVY, '#0c1526', '70% 78%'), hint: 'Interior walkthrough' },
  vendor_arrival: { src: null, alt: 'A coordinated vendor arriving on site', scene: scene('#152239', NAVY_DEEP, '30% 24%'), hint: 'Vendor arrival' },
  documentation: { src: null, alt: 'Close detail of field documentation being captured', scene: scene(NAVY, NAVY_DEEP, '80% 74%'), hint: 'Documentation' },
  completion: { src: null, alt: 'A completed project report on a phone', scene: scene('#14233c', NAVY_DEEP, '74% 22%'), hint: 'Completion report' },
  document_signing: { src: null, alt: 'Hands signing a document at a table', scene: scene('#101a2e', NAVY_DEEP, '26% 76%'), hint: 'Signing' },
  notary_remote: { src: null, alt: 'A remote online notarization video session', scene: scene('#13203a', '#0b1424', '76% 26%'), hint: 'Remote session' },
  courier_handoff: { src: null, alt: 'A document courier handoff', scene: scene(NAVY, NAVY_DEEP, '32% 30%'), hint: 'Courier handoff' },
  coordination: { src: null, alt: 'Administrative coordination over the phone', scene: scene('#121d33', NAVY_DEEP, '72% 76%'), hint: 'Coordination' },
  business_owner: { src: null, alt: 'A small-business owner working with a professional', scene: scene('#14213a', NAVY_DEEP, '24% 22%'), hint: 'Business support' },
  review: { src: null, alt: 'A professional reviewing documents', scene: scene(NAVY, '#0c1526', '78% 72%'), hint: 'Review' },
} satisfies Record<string, StoryImageSlot>

export type StoryImageKey = keyof typeof storyImages
