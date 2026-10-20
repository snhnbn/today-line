import { PALETTE } from '../lib/color'

interface Props {
  value: string | undefined
  onChange(color: string | undefined): void
  /** 지정하면 "프로젝트 색 따름" 선택지를 보여준다 */
  inheritColor?: string
}

export function ColorPicker({ value, onChange, inheritColor }: Props) {
  const isCustom = value !== undefined && !PALETTE.some((c) => c.value.toLowerCase() === value.toLowerCase())
  return (
    <div className="colors" role="radiogroup" aria-label="색상">
      {inheritColor && (
        <button
          type="button"
          role="radio"
          aria-checked={value === undefined}
          className={`swatch swatch--inherit${value === undefined ? ' is-active' : ''}`}
          style={{ background: inheritColor }}
          title="프로젝트 색 따름"
          onClick={() => onChange(undefined)}
        >
          ↺
        </button>
      )}
      {PALETTE.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value?.toLowerCase() === c.value.toLowerCase()}
          className={`swatch${value?.toLowerCase() === c.value.toLowerCase() ? ' is-active' : ''}`}
          style={{ background: c.value }}
          title={c.name}
          onClick={() => onChange(c.value)}
        />
      ))}
      <label className={`swatch swatch--custom${isCustom ? ' is-active' : ''}`} title="직접 선택" style={isCustom ? { background: value } : undefined}>
        <input
          type="color"
          value={value ?? inheritColor ?? PALETTE[0].value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        {!isCustom && '+'}
      </label>
    </div>
  )
}
