import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { searchGeocode } from '../geocode'
import { normalizeGeoQuery } from '../../../shared/geocode'

export const geoRoutes = new Hono<AppEnv>()

geoRoutes.get('/geo/search', async (c) => {
  const query = normalizeGeoQuery(c.req.query('q') || '')
  if (query.length < 4) return c.json({ results: [], cached: false, source: 'short' })
  if (query.length > 200) return c.json({ error: 'query too long' }, 400)
  const limit = Number(c.req.query('limit') || 5)
  const countryCodes = (c.req.query('countrycodes') || 'us').toLowerCase().replace(/[^a-z,]/g, '').slice(0, 12) || 'us'
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown'
  const result = await searchGeocode(c.env, query, { limit, countryCodes, ip })
  return c.json(result)
})
