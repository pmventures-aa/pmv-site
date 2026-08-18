import { describe, it, expect } from 'vitest'
import { storyImages, type StoryImageKey } from '../src/data/storyImages'

describe('story image slots', () => {
  const keys = Object.keys(storyImages) as StoryImageKey[]

  it('every slot has meaningful alt text and a placeholder scene', () => {
    for (const key of keys) {
      const slot = storyImages[key]
      expect(slot.alt.trim().length, `${key} needs alt text`).toBeGreaterThan(8)
      // Until a real photo is set, a gradient scene must render so layouts are
      // never broken; when src is set later, alt still applies.
      expect(slot.scene.length, `${key} needs a placeholder scene`).toBeGreaterThan(0)
      expect(slot.hint.trim().length).toBeGreaterThan(0)
    }
  })

  it('the homepage story slots all resolve to real slots', () => {
    // Keep this in sync with the slots referenced by Home's story sections; a
    // typo\'d slot name would otherwise render an empty box.
    const referenced = [
      'business_owner', 'review', 'coordination', 'field_inspection', 'documentation', 'completion',
      'property_exterior', 'vendor_arrival', 'property_interior', 'document_signing',
    ]
    for (const key of referenced) expect(keys).toContain(key)
  })
})
