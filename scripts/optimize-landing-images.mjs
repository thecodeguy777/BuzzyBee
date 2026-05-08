// One-shot image optimizer for the landing page.
// Reads PNGs from src/assets/landing/, outputs WebP at appropriate display sizes.
// Run: node scripts/optimize-landing-images.mjs

import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'

const dir = path.resolve('src/assets/landing')

// Per-image target widths (matching the largest size they're rendered at, with 2x retina headroom).
const targets = {
  // Hero collage: realtor portrait on right, ~520px container, 2x = 1040
  'hero-realtor-home.png':       { width: 1040, quality: 80 },
  'hero-realtor-houses.png':     { width: 1040, quality: 80 },
  // Hero secondary VA card, ~58% of 520 = 300, 2x = 600
  'hero-va-call.png':            { width: 700,  quality: 80 },
  'hero-va-desk.png':            { width: 700,  quality: 80 },
  // Pain banner: full width up to max-w-6xl (1152), 2x = 2304 — but it's stylized so 1600 is plenty
  'pain-laptop-paperwork.png':   { width: 1600, quality: 78 },
  'pain-houses-desk.png':        { width: 1600, quality: 78 },
  // How It Works: 3-up cards, ~360px each, 2x = 720
  'how-discovery-call.png':      { width: 800,  quality: 80 },
  'how-managed-call.png':        { width: 800,  quality: 80 },
  'how-team-call.png':           { width: 800,  quality: 80 },
  // Why HiveMind: side card ~360, 2x = 720
  'why-team-network.png':        { width: 800,  quality: 80 },
}

let totalBefore = 0
let totalAfter = 0

for (const [filename, opts] of Object.entries(targets)) {
  const inputPath = path.join(dir, filename)
  const outputPath = path.join(dir, filename.replace(/\.png$/, '.webp'))

  try {
    const beforeStat = await fs.stat(inputPath)
    totalBefore += beforeStat.size

    await sharp(inputPath)
      .resize(opts.width, null, { withoutEnlargement: true })
      .webp({ quality: opts.quality, effort: 6 })
      .toFile(outputPath)

    const afterStat = await fs.stat(outputPath)
    totalAfter += afterStat.size

    const before = (beforeStat.size / 1024).toFixed(0).padStart(5)
    const after = (afterStat.size / 1024).toFixed(0).padStart(5)
    const saved = ((1 - afterStat.size / beforeStat.size) * 100).toFixed(0)
    console.log(`${filename.padEnd(34)} ${before} KB -> ${after} KB  (-${saved}%)`)
  } catch (err) {
    console.warn(`Skipped ${filename}: ${err.message}`)
  }
}

console.log('─'.repeat(60))
const totalSaved = ((1 - totalAfter / totalBefore) * 100).toFixed(0)
console.log(`Total: ${(totalBefore / 1024 / 1024).toFixed(1)} MB -> ${(totalAfter / 1024 / 1024).toFixed(1)} MB  (-${totalSaved}%)`)
