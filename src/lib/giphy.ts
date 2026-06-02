// Giphy REST client for the Comms GIF picker. Needs VITE_GIPHY_KEY (free key
// from developers.giphy.com). No SDK — just fetch. Swap the BASE/host + mapping
// for Tenor later if desired; the picker only depends on this module's shape.
const KEY = import.meta.env.VITE_GIPHY_KEY as string | undefined
const BASE = 'https://api.giphy.com/v1/gifs'
// Work-appropriate ceiling. Adjust to 'g' / 'pg' to be stricter, 'r' to loosen.
const RATING = 'pg-13'

export interface Gif {
  id: string
  /** Animated GIF to send/show in the message (fixed-height ~200px). */
  url: string
  /** Smaller animated preview for the picker grid. */
  preview: string
  title: string
  width?: number
  height?: number
}

export const giphyEnabled = () => !!KEY

function map(data: any[]): Gif[] {
  return (data ?? [])
    .map((g) => {
      const img = g.images ?? {}
      return {
        id: g.id,
        url: img.fixed_height?.url ?? img.original?.url,
        preview: img.fixed_height_small?.url ?? img.fixed_width_small?.url ?? img.fixed_height?.url,
        title: g.title || 'GIF',
        width: Number(img.fixed_height?.width) || undefined,
        height: Number(img.fixed_height?.height) || undefined,
      } as Gif
    })
    .filter((g) => !!g.url && !!g.preview)
}

async function get(path: string, params: Record<string, string>): Promise<Gif[]> {
  if (!KEY) return []
  const qs = new URLSearchParams({ api_key: KEY, rating: RATING, bundle: 'messaging_non_clips', ...params })
  const res = await fetch(`${BASE}/${path}?${qs.toString()}`)
  if (!res.ok) throw new Error(`Giphy ${path} failed (${res.status})`)
  const json = await res.json()
  return map(json.data)
}

export function trendingGifs(limit = 24) {
  return get('trending', { limit: String(limit) })
}
export function searchGifs(q: string, limit = 24) {
  if (!q.trim()) return trendingGifs(limit)
  return get('search', { q, limit: String(limit) })
}
