/**
 * «Раскладка тонны» — подпись пульта.
 *
 * Лента ВСЕГДА одной ширины = 1 тонна сырья, независимо от захода.
 * Масштаб живёт в отдельной колонке. Это защита: лента, нормированная
 * на сырьё, физически не может показать «прибавку» от двойного счёта П/Ф.
 *
 * Второй ярус появляется только там, где полуфабрикат идёт в пресс (М2, М5).
 */

import type { MassBalance, MassSegmentCalc as MassSegment } from '../domain/yields'
import { PRODUCT_LABEL } from '../domain/types'

import { share, tons } from '../domain/units'

type RibbonData = MassBalance

const COLOR: Record<string, string> = {
  kernel: 'var(--kernel)',
  semi: 'var(--semi)',
  cat3: 'var(--cat3)',
  husk: 'var(--husk)',
  oil: 'var(--oil)',
  meal: 'var(--meal)',
  loss: 'var(--loss)',
}

/** Тёмный текст на светлых сегментах, светлый — на тёмных. */
const DARK_TEXT = new Set(['kernel', 'husk', 'loss'])

/* Подпись показывается, только если сегмент достаточно широк.
   Обрезанное «п» или «3…» хуже, чем пусто: значение всё равно есть
   в легенде, во всплывающей подсказке и в тексте для чтения с экрана. */
const SHOW_LABEL = 0.09
const SHOW_SHARE = 0.045

function Segment({ seg }: { seg: MassSegment }) {
  const dark = DARK_TEXT.has(seg.id)
  const label = `${PRODUCT_LABEL[seg.id]} ${share(seg.share)} % · ${tons(seg.tons)} т/мес${
    seg.note ? ` · ${seg.note}` : ''
  }`
  return (
    <div
      className={`rb-seg${seg.monetized ? '' : ' rb-seg--flat'}`}
      style={{
        flexGrow: seg.share,
        flexBasis: 0,
        background: COLOR[seg.id],
        color: dark ? 'var(--ink)' : '#fff',
      }}
      title={label}
    >
      {seg.share >= SHOW_LABEL && <span className="rb-seg-label">{PRODUCT_LABEL[seg.id]}</span>}
      {seg.share >= SHOW_SHARE && <span className="rb-seg-share num">{share(seg.share)}</span>}
    </div>
  )
}

export function Ribbon({ data }: { data: RibbonData }) {
  const stage2 = data.stage2
  const pressed = stage2 ? data.stage1.find((s) => s.id === stage2.from) : undefined
  const pressedShare = pressed?.share ?? 0

  return (
    <div className="rb">
      <div className="rb-bar" role="img" aria-label={ribbonAria(data)}>
        {data.stage1.map((s) => (
          <Segment key={s.id} seg={s} />
        ))}
      </div>

      {stage2 && pressed && (
        <div className="rb-stage2" style={{ width: `${pressedShare * 100}%` }}>
          <div className="rb-tie" aria-hidden="true" />
          <div className="rb-bar rb-bar--sub">
            {stage2.segments.map((s) => (
              <Segment key={s.id} seg={s} />
            ))}
          </div>
          <div className="rb-stage2-cap">
            {PRODUCT_LABEL[stage2.from]} прессуется
          </div>
        </div>
      )}
    </div>
  )
}

function ribbonAria(data: RibbonData): string {
  const one = data.stage1
    .map((s) => `${PRODUCT_LABEL[s.id]} ${share(s.share)} процента`)
    .join(', ')
  if (!data.stage2) return `Раскладка тонны сырья: ${one}`
  const two = data.stage2.segments
    .map((s) => `${PRODUCT_LABEL[s.id]} ${share(s.share)} процента`)
    .join(', ')
  return `Раскладка тонны сырья: ${one}. Полуфабрикат прессуется: ${two}`
}

/** Легенда — под лентой, чтобы цвет не был единственным маркером. */
export function RibbonLegend({ data }: { data: RibbonData }) {
  const all: MassSegment[] = [...data.stage1, ...(data.stage2?.segments ?? [])]
  return (
    <ul className="rb-legend">
      {all.map((s) => (
        <li key={s.id} className="rb-legend-item">
          <span className="rb-legend-dot" style={{ background: COLOR[s.id] }} aria-hidden="true" />
          <span className="rb-legend-name">{PRODUCT_LABEL[s.id]}</span>
          <span className="rb-legend-val num">
            {tons(s.tons)}
            <span className="unit">т/мес</span>
          </span>
          {!s.monetized && s.note !== PRODUCT_LABEL[s.id] && (
            <span className="rb-legend-note">{s.note ?? 'не продаётся'}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
