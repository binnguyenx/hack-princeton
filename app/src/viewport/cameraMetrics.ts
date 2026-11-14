function positive(...values: number[]) {
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error('Invalid camera scale')
}
export function perspectiveViewHeight(distance: number, fov: number, zoom: number): number {
  positive(distance, fov, zoom)
  if (fov >= 180) throw new Error('Invalid field of view')
  return 2 * distance * Math.tan(fov * Math.PI / 360) / zoom
}
export function perspectiveDistance(height: number, fov: number, zoom: number): number {
  positive(height, fov, zoom)
  if (fov >= 180) throw new Error('Invalid field of view')
  return height * zoom / (2 * Math.tan(fov * Math.PI / 360))
}
export function rulerScale(frustumHeight: number, zoom: number, viewportHeight: number) {
  if ([frustumHeight, zoom, viewportHeight].some((value) => !Number.isFinite(value) || value <= 0)) return null
  const pixelsPerMm = viewportHeight * zoom / frustumHeight
  const target = 100 / pixelsPerMm
  const magnitude = 10 ** Math.floor(Math.log10(target))
  const millimetres = [1, 2, 5, 10].map((n) => n * magnitude)
    .reduce((best, value) => Math.abs(value - target) < Math.abs(best - target) ? value : best)
  const pixels = millimetres * pixelsPerMm
  if (!Number.isFinite(pixels) || pixels <= 0) return null
  return { millimetres, pixels, pixelsPerMm }
}
