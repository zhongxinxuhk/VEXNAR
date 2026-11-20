// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'

// 档位定义集中在 lib/effort，组件只负责渲染；保留 re-export 供 ChatView 使用。
import {
  EFFORT_DEFAULT,
  EFFORT_LEVELS,
  EFFORT_TIERS,
  effortLabels,
  type EffortLevel
} from '@/lib/effort'

export { EFFORT_LEVELS, effortLabels }
export type { EffortLevel }

// 弹层宽度对齐 ChatGPT/Codex 的 .ModelPickerDropdownContent（254px）；
// 轨道 24px、thumb 28px、tick 4px 同样取自 app.asar 的真实样式表。
const PANEL_WIDTH = 254
const TRACK_HEIGHT = 30
const THUMB_SIZE = 26

// 星空填充移植自 LeiBox「reasoning-effort-slider」的 canvas 渲染器：
// 底色渐变随进度改变色相，7 条正弦流线做 screen 叠加，64 颗星点横向漂移，
// 左侧压暗角、头部加径向光晕。色相区间 210→273 与本项目的蓝紫色阶一致。
const STARS = Array.from({ length: 64 }, (_, i) => ({
  x: (i * 0.61803398875) % 1,
  y: (i * 0.754877666) % 1,
  size: 0.35 + (i % 5) * 0.13,
  speed: 0.3 + (i % 7) * 0.1
}))

function drawStarfield(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  phase: number,
  ratio: number
): void {
  if (width <= 0 || height <= 0) return
  ctx.clearRect(0, 0, width, height)
  const hue = 210 + ratio * ratio * 63
  const head = Math.max(32, 32 + (width - 32) * ratio)

  const base = ctx.createLinearGradient(0, 0, head, 0)
  base.addColorStop(0, `hsl(${hue - 16} 30% 44%)`)
  base.addColorStop(0.28, `hsl(${hue - 12} 38% 47%)`)
  base.addColorStop(0.65, `hsl(${hue} 79% 70%)`)
  base.addColorStop(1, `hsl(${hue + 5} 88% 70%)`)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  for (let line = 0; line < 7; line++) {
    ctx.beginPath()
    for (let x = 0; x <= width + 4; x += 4) {
      const y =
        height * (0.12 + line * 0.15) +
        Math.sin(x * 0.034 + phase + line * 1.8) * 5 +
        Math.sin(x * 0.079 - phase * 0.6 + line) * 2 -
        x * 0.035
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.lineWidth = 2 + (line % 3) * 2
    ctx.strokeStyle = `hsla(${hue + line * 2} 90% 87% / ${0.06 + ratio * 0.025})`
    ctx.stroke()
  }

  const glowX = head * (0.6 + Math.sin(phase * 0.7) * 0.12)
  const glow = ctx.createRadialGradient(glowX, height * 0.7, 0, glowX, height * 0.7, 46)
  glow.addColorStop(0, `hsla(${hue - 12} 100% 88% / 0.24)`)
  glow.addColorStop(1, `hsla(${hue} 100% 80% / 0)`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  for (let i = 0; i < STARS.length; i++) {
    const star = STARS[i]
    const x = ((star.x + phase * star.speed * 0.08) % 1) * width
    const y = ((((star.y - phase * star.speed * 0.04) % 1) + 1) % 1) * height
    const fade = Math.min(1, x / 55)
    const twinkle = 0.45 + Math.sin(phase * 2 + i * 1.9) * 0.25
    ctx.fillStyle = `rgba(255,255,255,${fade * twinkle * (0.4 + ratio * 0.6)})`
    ctx.beginPath()
    ctx.ellipse(x, y, star.size * (1 + ratio * 0.5), star.size * 0.65, -0.45, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  const vignette = ctx.createLinearGradient(0, 0, head, 0)
  vignette.addColorStop(0, `hsl(${hue - 18} 26% 37% / 0.55)`)
  vignette.addColorStop(0.45, 'rgba(36,39,44,0)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)
}

export function PowerSlider({
  index,
  count,
  accent,
  labels,
  disabled,
  onPreview,
  onCommit,
  onDraggingChange
}: {
  index: number
  count: number
  accent: string
  labels: string[]
  disabled?: boolean
  onPreview: (index: number) => void
  onCommit: (index: number) => void
  onDraggingChange?: (dragging: boolean) => void
}): React.JSX.Element {
  const railRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)
  const dotRef = useRef<HTMLSpanElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const metrics = useRef({ left: 0, inner: 1 })
  const pending = useRef(0)
  const pixelRef = useRef<HTMLCanvasElement>(null)
  const boostRef = useRef(0)
  const stopRef = useRef(index)
  const detach = useRef<(() => void) | null>(null)
  const draggingRef = useRef(false)
  const painted = useRef(false)
  const lastStop = useRef(index)
  const [activeStop, setActiveStop] = useState(index)
  const [dragging, setDragging] = useState(false)
  const stops = Array.from({ length: count }, (_, i) => i / (count - 1))
  // 果冻形变：按指针速度给 thumb 做拉伸/倾斜/不对称圆角。
  // 数值取自 LeiBox「模型思考强度滑块」：body 上限 .46、lean 上限同值、
  // offset 9px·lean、skew 12deg·lean、圆角 50±32/24%。
  const jelly = useRef({ x: 0, t: 0, timer: 0 })

  const applyJelly = (body: number, lean: number, fast: boolean): void => {
    const dot = dotRef.current
    if (!dot) return
    dot.style.transition = fast
      ? 'transform 90ms cubic-bezier(.22,1,.36,1), border-radius 90ms ease'
      : 'transform 720ms cubic-bezier(.22,1,.36,1), border-radius 720ms cubic-bezier(.22,1,.36,1)'
    dot.style.setProperty('--jelly-x', String(1 + body))
    dot.style.setProperty('--jelly-y', String(1 - body * 0.3))
    dot.style.setProperty('--jelly-offset', `${-lean * 9}px`)
    dot.style.setProperty('--jelly-skew', `${-lean * 12}deg`)
    dot.style.setProperty('--jelly-left', `${50 + lean * 32}%`)
    dot.style.setProperty('--jelly-right', `${50 - lean * 24}%`)
  }

  const pressJelly = (down: boolean): void => {
    thumbRef.current?.style.setProperty('--jelly-press', down ? '0.96' : '1')
  }

  // 拖动只动 DOM，不进 React 渲染：thumb 用 translate3d，填充用 clip-path，
  // 两者都在合成层完成，指针 120Hz 也不会掉帧、不会追不上手。
  const paint = (value: number, animate: boolean): void => {
    const thumb = thumbRef.current
    const fill = fillRef.current
    if (!thumb || !fill) return
    const x = value * metrics.current.inner
    thumb.style.transition = animate
      ? 'transform 300ms cubic-bezier(.22,1.35,.36,1)'
      : 'none'
    thumb.style.transform = `translate3d(${x}px, -50%, 0)`
    fill.style.clipPath = `inset(0 ${(1 - value) * 100}% 0 0 round 999px)`
  }

  const measure = (): void => {
    const rail = railRef.current
    if (!rail) return
    metrics.current = {
      left: rail.getBoundingClientRect().left,
      // offsetWidth 不受面板入场 scale 动画影响，避免首帧量到缩小后的宽度。
      inner: Math.max(1, rail.offsetWidth - THUMB_SIZE)
    }
  }

  stopRef.current = activeStop

  // 粒子循环：面板挂载即跑，卸载自动停；尺寸变化就地重设 canvas。
  useEffect(() => {
    const pixel = pixelRef.current
    if (!pixel) return
    const pixelCtx = pixel.getContext('2d')
    if (!pixelCtx) return
    let frame = 0
    let last = 0
    let clock = 0
    const fit = (canvas: HTMLCanvasElement): { width: number; height: number } => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const nextWidth = Math.max(1, Math.round(width * dpr))
      const nextHeight = Math.max(1, Math.round(height * dpr))
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth
        canvas.height = nextHeight
        canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      return { width, height }
    }
    const tick = (time: number): void => {
      const delta = Math.min(0.05, (time - (last || time - 16)) / 1000)
      last = time
      const ratio = count > 1 ? stopRef.current / (count - 1) : 0
      // 相位推进速度随进度与拖动强度上升：越靠高档星云流动越快。
      if (!document.hidden)
        clock += delta * (0.16 + ratio * 0.85) * (1 + boostRef.current * 1.6)
      const stage = fit(pixel)
      drawStarfield(pixelCtx, stage.width, stage.height, clock, ratio)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [count])

  // 首次挂载必须无过渡：此时 thumb 还停在 CSS 默认位置（最左），
  // 一旦带 300ms transition 就会看到它从 low 滑到当前档位。
  useLayoutEffect(() => {
    measure()
    paint(index / (count - 1), false)
    painted.current = true
  }, [])

  useEffect(() => {
    if (!painted.current || draggingRef.current) return
    measure()
    paint(index / (count - 1), true)
  }, [index, count])

  useEffect(
    () => () => {
      detach.current?.()
      window.clearTimeout(jelly.current.timer)
    },
    []
  )

  useEffect(() => {
    const rail = railRef.current
    if (!rail || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      measure()
      if (!draggingRef.current) paint(index / (count - 1), false)
    })
    observer.observe(rail)
    return () => observer.disconnect()
  }, [index, count])

  const ratioOf = (clientX: number): number =>
    Math.min(
      1,
      Math.max(
        0,
        (clientX - metrics.current.left - THUMB_SIZE / 2) /
          metrics.current.inner
      )
    )

  // 跨档反馈：档位点高亮 + thumb 一次极短的弹性缩放，跟手不中断。
  const stepTo = (next: number): void => {
    if (next === lastStop.current) return
    lastStop.current = next
    setActiveStop(next)
    onPreview(next)
  }

  const release = (clientX?: number): void => {
    detach.current?.()
    window.clearTimeout(jelly.current.timer)
    applyJelly(0, 0, false)
    pressJelly(false)
    boostRef.current = 0
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    onDraggingChange?.(false)
    const value = clientX === undefined ? pending.current : ratioOf(clientX)
    const nearest = Math.round(value * (count - 1))
    lastStop.current = nearest
    setActiveStop(nearest)
    paint(nearest / (count - 1), true)
    onCommit(nearest)
  }

  // 指针事件挂在 window 上：pointer capture 在部分 Electron 输入链路会提前丢失，
  // 一旦丢失拖动就断了；window 监听还能覆盖「拖出面板再松手」。
  const beginDrag = (clientX: number): void => {
    measure()
    draggingRef.current = true
    setDragging(true)
    onDraggingChange?.(true)
    pressJelly(true)
    jelly.current = { x: clientX, t: performance.now(), timer: 0 }
    const raw = ratioOf(clientX)
    pending.current = raw
    paint(raw, false)
    stepTo(Math.round(raw * (count - 1)))

    const onMove = (event: PointerEvent): void => {
      if (!draggingRef.current) return
      const next = ratioOf(event.clientX)
      pending.current = next
      paint(next, false)
      stepTo(Math.round(next * (count - 1)))

      // 速度 → 形变：px/ms 截到 3.5，body = .045 + v*.17（上限 .46）。
      const state = jelly.current
      const now = event.timeStamp || performance.now()
      const velocity =
        (event.clientX - state.x) / Math.max(8, now - state.t)
      state.x = event.clientX
      state.t = now
      const speed = Math.min(3.5, Math.abs(velocity))
      // 参考实现上限 .46；这里收到 .38，面板尺寸更小，形变太大会发虚。
      const body = Math.min(0.38, 0.045 + speed * 0.15)
      applyJelly(body, Math.sign(velocity) * body, true)
      boostRef.current = Math.min(1, body / 0.38)
      window.clearTimeout(state.timer)
      state.timer = window.setTimeout(() => applyJelly(0, 0, false), 90)
    }
    const onUp = (event: PointerEvent): void => release(event.clientX)
    const onCancel = (): void => release()
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    detach.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      detach.current = null
    }
  }

  return (
    <div
      role="slider"
      aria-label="推理强度"
      aria-valuemin={0}
      aria-valuemax={count - 1}
      aria-valuenow={activeStop}
      aria-valuetext={labels[activeStop]}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      data-dragging={dragging}
      data-maximum={activeStop === count - 1 || undefined}
      className={cn(
        'model-picker-slider relative flex h-7 w-full touch-none select-none items-center outline-none',
        disabled && 'opacity-60'
      )}
      onKeyDown={(event) => {
        if (disabled) return
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault()
          const next = Math.min(count - 1, index + 1)
          if (next !== index) onCommit(next)
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          event.preventDefault()
          const next = Math.max(0, index - 1)
          if (next !== index) onCommit(next)
        }
      }}
      onPointerDown={(event) => {
        if (disabled) return
        event.preventDefault()
        event.stopPropagation()
        ;(event.currentTarget as HTMLElement).focus()
        beginDrag(event.clientX)
      }}
    >
      <div
        ref={railRef}
        className="relative w-full overflow-hidden rounded-full"
        style={{ height: TRACK_HEIGHT }}
      >
        <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--color-ink)_10%,transparent)] shadow-[inset_0_0_0_0.5px_var(--color-line)]" />
        {/* 轨道底纹是低→高的色阶刻度：没填充到的区段也能读出强度走向。 */}
        <div
          aria-hidden="true"
          className="model-picker-rail-tiers absolute inset-0"
          style={{
            background: `linear-gradient(90deg, ${[
              EFFORT_DEFAULT.color,
              ...EFFORT_LEVELS.map((level) => EFFORT_TIERS[level].color)
            ]
              .map((color, i, all) => `${color} ${(i / (all.length - 1)) * 100}%`)
              .join(', ')})`
          }}
        />
        <div
          ref={fillRef}
          className="model-picker-fill absolute inset-0 overflow-hidden"
          style={
            {
              clipPath: 'inset(0 100% 0 0)',
              '--tier-color': accent
            } as React.CSSProperties
          }
        >
          <canvas
            ref={pixelRef}
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
          />
        </div>
        <div className="pointer-events-none absolute inset-0">
          {stops.map((stop, i) => {
            const selected = i <= activeStop
            return (
              <span
                key={stop}
                className={cn(
                  'model-picker-tick absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full',
                  selected ? 'bg-white/40' : 'bg-ink/25',
                  i === activeStop && 'model-picker-tick-active'
                )}
                style={{
                  left: `calc(${THUMB_SIZE / 2}px + ${stop} * (100% - ${THUMB_SIZE}px))`
                }}
              />
            )
          })}
        </div>
      </div>
      <span
        ref={thumbRef}
        aria-hidden="true"
        className="model-picker-thumb pointer-events-none absolute z-10"
        style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
      >
        <span
          ref={dotRef}
          className="model-picker-thumb-dot block size-full"
        />
      </span>
    </div>
  )
}


export function ModelPicker({
  model,
  models,
  effort,
  saving,
  error,
  disabled,
  formatModel,
  onModel,
  onEffortPreview,
  onEffortCommit,
  onClearEffort,
  onOpenSettings
}: {
  model: string
  models: string[]
  effort?: EffortLevel
  saving?: boolean
  error?: string
  disabled?: boolean
  formatModel: (model: string) => string
  onModel: (model: string) => void
  onEffortPreview: (level: EffortLevel | undefined) => void
  onEffortCommit: (level: EffortLevel) => void
  onClearEffort: () => void
  onOpenSettings: () => void
}): React.JSX.Element {
  const [view, setView] = useState<'slider' | 'list'>('slider')
  const [open, setOpen] = useState(false)
  // 滑块 6 个位置：0 = 默认（不发送），1..5 = low..max。
  const index = effort ? EFFORT_LEVELS.indexOf(effort) + 1 : 0
  const tier = effort ? EFFORT_TIERS[effort] : undefined
  const label = effort ? effortLabels[effort] : EFFORT_DEFAULT.label
  const current = label
  const catalog = Array.from(new Set([model, ...models].filter(Boolean)))
  const others = catalog.filter((item) => item !== model)

  useEffect(() => {
    if (!open) setView('slider')
  }, [open])

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="选择推理强度与模型"
          disabled={disabled}
          className={cn(
            'flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-line-soft bg-panel px-2.5 text-[11.5px] text-ink-soft transition-colors hover:bg-panel-2',
            open && 'bg-panel-2',
            disabled && 'opacity-50'
          )}
        >
          <span className="max-w-[124px] truncate text-ink-soft">
            {formatModel(model)}
          </span>
          <span
            className={cn('shrink-0', effort ? 'font-medium' : 'text-muted')}
            style={tier ? { color: tier.color } : undefined}
          >
            {label}
          </span>
          {saving ? <Loader2 className="size-3 animate-spin text-muted" /> : null}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="model-picker-panel codex-popover z-50 overflow-hidden rounded-[18px] border-[0.5px] border-black/[0.08] bg-bg outline-none"
          style={{ width: PANEL_WIDTH }}
        >
          <div
            className="model-picker-views relative"
            style={{ height: view === 'list' ? 312 : error ? 104 : 86 }}
          >
            <div
              data-active={view === 'slider'}
              className="model-picker-view absolute inset-x-0 top-0 px-2.5 pb-2 pt-2.5"
            >
              <div className="grid grid-cols-[22px_1fr_22px] items-center">
                <Zap
                  className="size-3.5 text-muted"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  aria-label="展开模型列表"
                  onClick={() => setView('list')}
                  title={effort ? EFFORT_TIERS[effort].hint : '不发送推理强度，由模型决定'}
                  className="group flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-1 py-1 outline-none transition-colors hover:bg-panel/70 focus-visible:bg-panel/70"
                >
                  <span className="truncate text-[12px] leading-4 text-ink-soft">
                    {formatModel(model)}
                  </span>
                  <span
                    className="shrink-0 text-[12px] font-semibold leading-4"
                    style={{ color: tier?.color ?? 'var(--color-muted)' }}
                  >
                    {current}
                  </span>
                  <ChevronRight
                    className="size-3 shrink-0 text-muted"
                    strokeWidth={2}
                  />
                </button>
                <button
                  type="button"
                  aria-label="重置推理强度"
                  onClick={onClearEffort}
                  className="grid size-[22px] place-items-center rounded-md text-muted transition-colors hover:bg-panel hover:text-ink-soft"
                >
                  <RotateCcw className="size-3.5" strokeWidth={1.9} />
                </button>
              </div>
              <div className="mt-2">
                <PowerSlider
                  index={index}
                  count={EFFORT_LEVELS.length + 1}
                  accent={tier?.color ?? EFFORT_DEFAULT.color}
                  labels={[EFFORT_DEFAULT.label, ...EFFORT_LEVELS.map((level) => effortLabels[level])]}
                  disabled={saving || disabled}
                  onPreview={(next) =>
                    next === 0
                      ? onEffortPreview(undefined)
                      : onEffortPreview(EFFORT_LEVELS[next - 1])
                  }
                  onCommit={(next) =>
                    next === 0
                      ? onClearEffort()
                      : onEffortCommit(EFFORT_LEVELS[next - 1])
                  }
                />
              </div>
              {error ? (
                <p role="alert" className="mt-1.5 px-0.5 text-[10px] leading-3 text-danger">
                  {error}
                </p>
              ) : null}
            </div>

            <div
              data-active={view === 'list'}
              className="model-picker-view absolute inset-x-0 top-0 px-2 pb-2 pt-2"
            >
              <div className="flex items-center gap-1 px-1 pb-1.5">
                <button
                  type="button"
                  aria-label="返回推理强度"
                  onClick={() => setView('slider')}
                  className="grid size-5 place-items-center rounded-md text-muted transition-colors hover:bg-panel hover:text-ink-soft"
                >
                  <ChevronLeft className="size-3.5" strokeWidth={2} />
                </button>
                <span className="text-[11px] font-medium text-ink-soft">选择模型</span>
              </div>
              <div className="model-picker-list max-h-[268px] overflow-y-auto pb-1">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted/80">
                  默认
                </div>
                <ModelRow
                  active={model === catalog[0]}
                  label={formatModel(model)}
                  onClick={() => {
                    onModel(model)
                    setOpen(false)
                  }}
                />
                {others.length > 0 ? (
                  <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-wide text-muted/80">
                    推荐模型集
                  </div>
                ) : null}
                {others.map((item) => (
                  <ModelRow
                    key={item}
                    active={false}
                    label={formatModel(item)}
                    onClick={() => {
                      onModel(item)
                      setOpen(false)
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function ModelRow({
  active,
  label,
  onClick
}: {
  active: boolean
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-[7px] text-left text-[12.5px] transition-colors',
        active ? 'bg-panel-2 text-ink' : 'text-ink-soft hover:bg-panel-2'
      )}
    >
      <span className="truncate">{label}</span>
      {active ? <Check className="ml-auto size-3.5 shrink-0" /> : null}
    </button>
  )
}
