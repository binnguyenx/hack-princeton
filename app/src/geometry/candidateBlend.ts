export type CandidateBlend = 'normal' | 'maximum' | 'difference'
export function blendSlice(background: Uint8Array, foreground: Uint8Array | undefined, center: number, width: number, opacity: number, mode: CandidateBlend): Uint8ClampedArray {
  if (foreground && foreground.length !== background.length) throw new Error('Foreground grid differs from source')
  const output = new Uint8ClampedArray(background.length * 4)
  const alpha = Math.max(0, Math.min(1, opacity))
  const grey = (value: number) => Math.round(Math.max(0, Math.min(255, (value - (center - width / 2)) / Math.max(width, 1) * 255)))
  for (let index = 0; index < background.length; index++) {
    const base = grey(background[index])
    let rgb = [base, base, base]
    if (foreground) {
      const value = foreground[index]
      if (mode === 'normal' && value > 0) rgb = [0, 82, 204].map((channel) => Math.round(base * (1 - alpha) + channel * alpha))
      if (mode !== 'normal') {
        const combined = mode === 'maximum' ? Math.max(background[index], value) : Math.abs(background[index] - value)
        const channel = Math.round(base * (1 - alpha) + grey(combined) * alpha)
        rgb = [channel, channel, channel]
      }
    }
    output.set([...rgb, 255], index * 4)
  }
  return output
}
