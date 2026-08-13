import {
  CREST_LETTERHEAD_HEIGHT,
  CREST_LETTERHEAD_WIDTH,
  CREST_PATH,
  FIRM_NAME,
} from '../../../shared/letterhead'

export function LetterheadCrest({ decorative = true }: { decorative?: boolean }) {
  return (
    <img
      src={CREST_PATH}
      alt={decorative ? '' : `${FIRM_NAME} crest`}
      width={CREST_LETTERHEAD_WIDTH}
      height={CREST_LETTERHEAD_HEIGHT}
      className="block shrink-0"
      style={{ width: CREST_LETTERHEAD_WIDTH, height: CREST_LETTERHEAD_HEIGHT }}
    />
  )
}
