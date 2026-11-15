/** Pure measurement helpers for annotation control points (RAS mm). */

export type RasPoint = [number, number, number]

function dist(a: RasPoint, b: RasPoint): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  return Math.hypot(dx, dy, dz)
}

export function lineDistance(a: RasPoint, b: RasPoint): number {
  return dist(a, b)
}

export function closedCurveLength(pts: RasPoint[]): number {
  if (pts.length < 2) return 0
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    total += dist(pts[i], pts[i + 1])
  }
  total += dist(pts[pts.length - 1], pts[0])
  return total
}

export function openCurveLength(pts: RasPoint[]): number {
  if (pts.length < 2) return 0
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    total += dist(pts[i], pts[i + 1])
  }
  return total
}

export function angleDegrees(a: RasPoint, b: RasPoint, c: RasPoint): number {
  const ab: RasPoint = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const cb: RasPoint = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
  const abLen = Math.hypot(ab[0], ab[1], ab[2])
  const cbLen = Math.hypot(cb[0], cb[1], cb[2])
  if (abLen === 0 || cbLen === 0) return 0
  const dot = ab[0] * cb[0] + ab[1] * cb[1] + ab[2] * cb[2]
  const cos = Math.min(1, Math.max(-1, dot / (abLen * cbLen)))
  return (Math.acos(cos) * 180) / Math.PI
}

export function roiVolume(min: RasPoint, max: RasPoint): number {
  return (
    Math.abs(max[0] - min[0]) *
    Math.abs(max[1] - min[1]) *
    Math.abs(max[2] - min[2])
  )
}

export function landmarkCoord(p: RasPoint): string {
  const fmt = (n: number) => n.toFixed(2)
  return `R ${fmt(p[0])} · A ${fmt(p[1])} · S ${fmt(p[2])} mm`
}

/** Unit normal from plane control points (three-point preferred; else Z). */
export function planeNormal(pts: RasPoint[]): RasPoint {
  if (pts.length >= 3) {
    const [a, b, c] = pts
    const ab: RasPoint = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const ac: RasPoint = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const nx = ab[1] * ac[2] - ab[2] * ac[1]
    const ny = ab[2] * ac[0] - ab[0] * ac[2]
    const nz = ab[0] * ac[1] - ab[1] * ac[0]
    const nLen = Math.hypot(nx, ny, nz)
    if (nLen === 0) return [0, 0, 1]
    return [nx / nLen, ny / nLen, nz / nLen]
  }
  if (pts.length === 2) {
    const dx = pts[1][0] - pts[0][0]
    const dy = pts[1][1] - pts[0][1]
    const dz = pts[1][2] - pts[0][2]
    const nLen = Math.hypot(dx, dy, dz)
    if (nLen === 0) return [0, 0, 1]
    return [dx / nLen, dy / nLen, dz / nLen]
  }
  return [0, 0, 1]
}

/** Area of plane ∩ axis-aligned bbox (mm²), using projected AABB faces. */
export function planeArea(pts: RasPoint[], boundingBoxMm: number[]): number {
  if (boundingBoxMm.length < 3) return 0
  const [lx, ly, lz] = boundingBoxMm
  if (pts.length >= 3) {
    const [a, b, c] = pts
    const ab: RasPoint = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const ac: RasPoint = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const nx = ab[1] * ac[2] - ab[2] * ac[1]
    const ny = ab[2] * ac[0] - ab[0] * ac[2]
    const nz = ab[0] * ac[1] - ab[1] * ac[0]
    const nLen = Math.hypot(nx, ny, nz)
    if (nLen === 0) return 0
    const ux = Math.abs(nx / nLen)
    const uy = Math.abs(ny / nLen)
    const uz = Math.abs(nz / nLen)
    return lx * ly * uz + ly * lz * ux + lz * lx * uy
  }
  return Math.max(lx * ly, ly * lz, lz * lx)
}
