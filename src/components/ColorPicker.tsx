import { PALETTE, displayColor } from '../lib/color'

interface Props {
  value: string | undefined
  onChange(color: string | undefined): void
  /** 지정하면 "프로젝트 색 따름" 선택지를 보여준다 (저장된 원래 값을 넘겨도 된다) */
  inheritColor?: string
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export function ColorPicker({ value, onChange, inheritColor }: Props) {
  // 옛 프리셋 값이 저장돼 있어도 대응하는 새 프리셋이 선택된 것으로 보이게 표시 색으로 비교한다
  const shown = value === undefined ? undefined : displayColor(value)
  const inheritShown = inheritColor === undefined ? undefined : displayColor(inheritColor)
  const isCustom = shown !== undefined && !PALETTE.some((c) => same(c.value, shown))
  return (
    <div className="colors" role="radiogroup" aria-label="색상">
      {inheritShown && (
        <button
          type="button"
          role="radio"
          aria-checked={value === undefined}
          className={`swatch swatch--inherit${value === undefined ? ' is-active' : ''}`}
          style={{ background: inheritShown }}
          title="프로젝트 색 따름"
          onClick={() => onChange(undefined)}
        >
          ↺
        </button>
      )}
      {PALETTE.map((c) => {
        const active = shown !== undefined && same(shown, c.value)
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`swatch${active ? ' is-active' : ''}`}
            style={{ background: c.value }}
            title={c.name}
            onClick={() => onChange(c.value)}
          />
        )
      })}
      <label className={`swatch swatch--custom${isCustom ? ' is-active' : ''}`} title="직접 선택" style={isCustom ? { background: shown } : undefined}>
        <input
          type="color"
          value={shown ?? inheritShown ?? PALETTE[0].value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        {!isCustom && '+'}
      </label>
    </div>
  )
}
