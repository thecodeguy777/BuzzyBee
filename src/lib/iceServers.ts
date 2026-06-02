// Shared WebRTC ICE config. STUN handles most same/normal-network peers; TURN
// (a relay) is what makes connections work across strict/symmetric NATs — the
// reason public meeting links need it. Provide TURN via env to enable it:
//   VITE_TURN_URL=turn:host:3478           (comma-separate for multiple)
//   VITE_TURN_USERNAME=...                 (Metered/Cloudflare/coturn)
//   VITE_TURN_CREDENTIAL=...
// Without TURN it falls back to STUN-only (works on normal networks).
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
  const url = import.meta.env.VITE_TURN_URL as string | undefined
  if (url) {
    servers.push({
      urls: url.split(',').map((s) => s.trim()).filter(Boolean),
      username: import.meta.env.VITE_TURN_USERNAME as string | undefined,
      credential: import.meta.env.VITE_TURN_CREDENTIAL as string | undefined,
    })
  }
  return servers
}

export const hasTurn = () => !!import.meta.env.VITE_TURN_URL
