// Local-SEO service areas for the cleaning line. Pure data + lookups shared by
// the public area pages and any structured-data / sitemap generation. Keeping
// this in shared/ means the URL slugs and the county each area maps to never
// drift between the router, the page copy, and the pricing default.

import type { CleaningCounty } from './cleaningPricing'

export interface CleaningServiceArea {
  /** URL slug, e.g. 'miami' -> /cleaning/miami */
  slug: string
  /** City / place name as it should read in copy and the H1. */
  city: string
  county: CleaningCounty
  countyLabel: string
  /** Neighborhoods or nearby places to mention for local relevance. */
  neighborhoods: string[]
}

// A focused set of marquee cities per county - enough to own the local terms
// without spinning up hundreds of thin pages. Order is display order within a
// county on the areas index.
export const CLEANING_SERVICE_AREAS: CleaningServiceArea[] = [
  // Miami-Dade
  { slug: 'miami', city: 'Miami', county: 'miami_dade', countyLabel: 'Miami-Dade County', neighborhoods: ['Brickell', 'Downtown', 'Wynwood', 'Little Havana'] },
  { slug: 'miami-beach', city: 'Miami Beach', county: 'miami_dade', countyLabel: 'Miami-Dade County', neighborhoods: ['South Beach', 'Mid-Beach', 'North Beach'] },
  { slug: 'coral-gables', city: 'Coral Gables', county: 'miami_dade', countyLabel: 'Miami-Dade County', neighborhoods: ['Coconut Grove', 'South Miami'] },
  { slug: 'aventura', city: 'Aventura', county: 'miami_dade', countyLabel: 'Miami-Dade County', neighborhoods: ['Sunny Isles Beach', 'North Miami Beach'] },
  { slug: 'doral', city: 'Doral', county: 'miami_dade', countyLabel: 'Miami-Dade County', neighborhoods: ['Fontainebleau', 'Sweetwater'] },

  // Broward
  { slug: 'fort-lauderdale', city: 'Fort Lauderdale', county: 'broward', countyLabel: 'Broward County', neighborhoods: ['Las Olas', 'Victoria Park', 'Wilton Manors'] },
  { slug: 'hollywood', city: 'Hollywood', county: 'broward', countyLabel: 'Broward County', neighborhoods: ['Hollywood Beach', 'Dania Beach'] },
  { slug: 'pembroke-pines', city: 'Pembroke Pines', county: 'broward', countyLabel: 'Broward County', neighborhoods: ['Miramar', 'Cooper City'] },
  { slug: 'pompano-beach', city: 'Pompano Beach', county: 'broward', countyLabel: 'Broward County', neighborhoods: ['Lighthouse Point', 'Deerfield Beach'] },
  { slug: 'weston', city: 'Weston', county: 'broward', countyLabel: 'Broward County', neighborhoods: ['Davie', 'Southwest Ranches'] },

  // Palm Beach
  { slug: 'west-palm-beach', city: 'West Palm Beach', county: 'palm_beach', countyLabel: 'Palm Beach County', neighborhoods: ['Palm Beach', 'Lake Worth Beach'] },
  { slug: 'boca-raton', city: 'Boca Raton', county: 'palm_beach', countyLabel: 'Palm Beach County', neighborhoods: ['Highland Beach', 'Deerfield Beach'] },
  { slug: 'delray-beach', city: 'Delray Beach', county: 'palm_beach', countyLabel: 'Palm Beach County', neighborhoods: ['Gulf Stream', 'Boynton Beach'] },
  { slug: 'jupiter', city: 'Jupiter', county: 'palm_beach', countyLabel: 'Palm Beach County', neighborhoods: ['Palm Beach Gardens', 'Tequesta'] },
  { slug: 'wellington', city: 'Wellington', county: 'palm_beach', countyLabel: 'Palm Beach County', neighborhoods: ['Royal Palm Beach', 'Loxahatchee'] },
]

export function findServiceArea(slug: string): CleaningServiceArea | undefined {
  return CLEANING_SERVICE_AREAS.find((a) => a.slug === slug)
}

/** Other areas in the same county, for internal linking on an area page. */
export function nearbyAreas(area: CleaningServiceArea, limit = 4): CleaningServiceArea[] {
  return CLEANING_SERVICE_AREAS.filter((a) => a.county === area.county && a.slug !== area.slug).slice(0, limit)
}

/** Areas grouped by county in declared order, for the areas index. */
export function areasByCounty(): { county: CleaningCounty; label: string; areas: CleaningServiceArea[] }[] {
  const order: CleaningCounty[] = ['miami_dade', 'broward', 'palm_beach']
  return order.map((county) => ({
    county,
    label: CLEANING_SERVICE_AREAS.find((a) => a.county === county)?.countyLabel ?? county,
    areas: CLEANING_SERVICE_AREAS.filter((a) => a.county === county),
  }))
}
