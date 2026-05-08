import path from 'path'

export const isDev = process.argv.includes('--dev')

export const RENDERER_DEV_URL = 'http://localhost:5177'

// __dirname at runtime = electron/dist-main/main/
export function getRendererPath(file: string): string {
  if (isDev) {
    return `${RENDERER_DEV_URL}/${file}`
  }
  return `file://${path.join(__dirname, '..', '..', 'dist-renderer', file)}`
}

export function getPreloadPath(name: string): string {
  return path.join(__dirname, '..', 'preload', `${name}.js`)
}
