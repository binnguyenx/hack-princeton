import {
  ANNOTATION_COLOR_KEYS,
  annotationColorCss,
  type AnnotationColorKey,
} from '../domain/annotationPalette'

/** The shared annotation palette as a row of swatch buttons (list rows and placement strip). */
export function AnnotationColorSwatches({
  value,
  onChange,
  disabled = false,
  label = 'Annotation color',
}: {
  value: AnnotationColorKey
  onChange: (color: AnnotationColorKey) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <div className="annotation-color-swatches" role="group" aria-label={label}>
      {ANNOTATION_COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className={`annotation-color-swatch ${value === key ? 'is-active' : ''}`}
          aria-label={`Color ${key}`}
          aria-pressed={value === key}
          disabled={disabled}
          style={{ background: annotationColorCss(key) }}
          onClick={() => {
            if (!disabled && key !== value) onChange(key)
          }}
        />
      ))}
    </div>
  )
}
