import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Source-shape tests for the proof-of-work location association
// slice. The spec is explicit that Pinnacle app-captured location
// must never be conflated with photo EXIF - Pinnacle does not read
// EXIF today, so the safest place to pin the label is at both the
// storage layer (column names include app_*) and the UI (rendered
// text says "Pinnacle app location at record" not "photo location").

describe('field_assignment_documents capture-location schema', () => {
  const source = readFileSync(new URL('../migrations/0081_field_document_capture_location.sql', import.meta.url), 'utf8')

  it('adds four new nullable columns to preserve existing records', () => {
    for (const column of ['app_captured_at', 'app_capture_latitude', 'app_capture_longitude', 'app_capture_accuracy_m']) {
      expect(source).toContain(column)
    }
    // ALTER TABLE ... ADD COLUMN in SQLite makes the column nullable
    // by default; pin that no NOT NULL constraint was added.
    expect(source).not.toContain('NOT NULL')
  })

  it('uses REAL for lat/lng and TEXT for the captured_at ISO string', () => {
    expect(source).toContain('app_capture_latitude   REAL')
    expect(source).toContain('app_capture_longitude  REAL')
    expect(source).toContain('app_capture_accuracy_m REAL')
    expect(source).toContain('app_captured_at        TEXT')
  })

  it('documents the do-not-conflate-with-EXIF rule at the schema layer', () => {
    // Comment must exist so a future refactor cannot silently start
    // ingesting EXIF into the same columns.
    expect(source).toContain('Photo EXIF location')
    expect(source).toContain('Pinnacle app location at upload')
    expect(source).toContain('Do not pretend they are the same')
  })
})

describe('field_assignment_documents capture-location ingest', () => {
  const source = readFileSync(new URL('../functions/_lib/routes/fieldWork.ts', import.meta.url), 'utf8')

  it('accepts app_capture_* on POST /field-assignments/:id/documents', () => {
    for (const field of ['app_captured_at', 'app_capture_latitude', 'app_capture_longitude', 'app_capture_accuracy_m']) {
      expect(source).toContain(field)
    }
  })

  it('validates lat/lng before persisting - a coord outside [-90..90]/[-180..180] is dropped, not stored as bogus', () => {
    expect(source).toContain('captureLat >= -90 && captureLat <= 90 && captureLng >= -180 && captureLng <= 180')
    // If validation fails, all four columns must be nulled together -
    // storing a captured_at with no coord (or vice versa) would create
    // a nonsense partial record.
    expect(source).toContain('captureValid ? capturedAt : null')
    expect(source).toContain('captureValid ? captureLat : null')
    expect(source).toContain('captureValid ? captureLng : null')
    expect(source).toContain('captureValid ? captureAccuracy : null')
  })
})

describe('field_assignment_documents capture-location UI', () => {
  const source = readFileSync(new URL('../src/pages/admin/FieldWorkVendor.tsx', import.meta.url), 'utf8')

  it('sends best-effort app_capture_* on document create, silent on failure', () => {
    expect(source).toContain('const capture = await getPosition().catch(() => null)')
    // Nullable fallthrough - a device without location permission
    // still records the document, just without the capture location.
    expect(source).toContain('capture?.coords.latitude ?? null')
    expect(source).toContain('capture?.coords.longitude ?? null')
  })

  it('always labels the field as "Pinnacle app location at record" in the display', () => {
    // The spec is explicit: never present app-captured coords as if
    // they were photo EXIF. The label must exist in the rendered UI.
    expect(source).toContain('Pinnacle app location at record')
  })
})
