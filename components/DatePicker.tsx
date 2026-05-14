'use client'

import { useState, useRef, useEffect } from 'react'

interface Props {
  value: string       // DD-MM-YYYY or ''
  onChange: (val: string) => void
  placeholder?: string
  minDate?: string    // DD-MM-YYYY — days before this are disabled
  maxDate?: string    // DD-MM-YYYY — days after this are disabled
  autoOpen?: boolean  // open calendar immediately on mount
  onClose?: () => void // called when calendar closes without selection
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa']

function parseDate(dmy: string): Date | null {
  if (!dmy) return null
  const [d, m, y] = dmy.split('-').map(Number)
  if (!d || !m || !y || y < 1000) return null
  const dt = new Date(y, m - 1, d)
  return isNaN(dt.getTime()) ? null : dt
}

function fmt2(n: number) { return String(n).padStart(2, '0') }

export default function DatePicker({ value, onChange, placeholder = 'DD-MM-YYYY', minDate, maxDate, autoOpen, onClose }: Props) {
  const [open, setOpen]           = useState(false)
  const [yearPicker, setYearPicker] = useState(false)
  const [viewYear, setViewYear]   = useState(new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(new Date().getMonth())
  const [yearBase, setYearBase]   = useState(Math.floor(new Date().getFullYear() / 12) * 12)
  const [flipLeft, setFlipLeft]   = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const parsed = parseDate(value)

  function handleOpen() {
    const base = parsed ?? new Date()
    setViewYear(base.getFullYear())
    setViewMonth(base.getMonth())
    setYearBase(Math.floor(base.getFullYear() / 12) * 12)
    setYearPicker(false)
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setFlipLeft(rect.left + 240 > window.innerWidth)
    }
    setOpen(true)
  }

  useEffect(() => {
    if (autoOpen) handleOpen()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen])

  useEffect(() => {
    if (!open) return
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        onClose?.()
      }
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open, onClose])

  function selectDay(day: number) {
    onChange(`${fmt2(day)}-${fmt2(viewMonth + 1)}-${viewYear}`)
    setOpen(false)
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const firstDow    = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null)

  const years = Array.from({ length: 12 }, (_, i) => yearBase + i)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const parsedMin = parseDate(minDate ?? '')
  const parsedMax = parseDate(maxDate ?? '')

  const isDisabled = (d: number) => {
    const dt = new Date(viewYear, viewMonth, d)
    if (parsedMin && dt < parsedMin) return true
    if (parsedMax && dt > parsedMax) return true
    return false
  }
  const isToday = (d: number) =>
    today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d
  const isSelected = (d: number) =>
    !!parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth && parsed.getDate() === d

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Input row */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={10}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          onClick={() => open ? setOpen(false) : handleOpen()}
          title="Open calendar"
          style={{
            flexShrink: 0,
            width: 34,
            height: 34,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: open ? 'var(--surface2)' : 'var(--surface)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            transition: 'background .15s',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25A2.25 2.25 0 0 1 15.5 4.25v9A2.25 2.25 0 0 1 13.25 15.5H2.75A2.25 2.25 0 0 1 .5 13.25v-9A2.25 2.25 0 0 1 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2 6.5v6.75c0 .414.336.75.75.75h10.5a.75.75 0 0 0 .75-.75V6.5H2Zm.75-3A.75.75 0 0 0 2 4.25V5h12v-.75a.75.75 0 0 0-.75-.75H2.75Z"/>
          </svg>
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          ...(flipLeft ? { right: 0 } : { left: 0 }),
          zIndex: 200,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
          width: 240,
          padding: 12,
          fontFamily: 'var(--font)',
        }}>

          {yearPicker ? (
            /* ── Year grid ── */
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <button type="button" onClick={() => setYearBase(b => b - 12)} style={navBtn}>‹</button>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                  {yearBase} – {yearBase + 11}
                </span>
                <button type="button" onClick={() => setYearBase(b => b + 12)} style={navBtn}>›</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                {years.map(y => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => { setViewYear(y); setYearPicker(false) }}
                    style={{
                      ...yearBtn,
                      background: y === viewYear ? 'var(--fg)' : 'transparent',
                      color: y === viewYear ? 'var(--bg)' : 'var(--text)',
                      fontWeight: y === viewYear ? 600 : 400,
                    }}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </>
          ) : (
            /* ── Month calendar ── */
            <>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <button type="button" onClick={prevMonth} style={navBtn}>‹</button>
                <button
                  type="button"
                  onClick={() => setYearPicker(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text)', padding: '2px 6px', borderRadius: 6 }}
                >
                  {MONTHS[viewMonth]} {viewYear}
                </button>
                <button type="button" onClick={nextMonth} style={navBtn}>›</button>
              </div>

              {/* Day-of-week labels */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
                {DAYS.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 600, color: 'var(--text-hint)', letterSpacing: '0.04em', padding: '2px 0' }}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {cells.map((day, i) => {
                  const disabled = !day || isDisabled(day)
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={disabled}
                      onClick={() => day && !isDisabled(day) && selectDay(day)}
                      style={{
                        ...dayBtn,
                        background: day && isSelected(day) ? 'var(--fg)' : 'transparent',
                        color: disabled ? 'var(--text-hint)' : day && isSelected(day) ? 'var(--bg)' : day && isToday(day) ? 'var(--accent-solid, #2563eb)' : 'var(--text)',
                        fontWeight: day && (isSelected(day) || isToday(day)) ? 600 : 400,
                        opacity: day ? (isDisabled(day) ? 0.3 : 1) : 0,
                        cursor: disabled ? 'default' : 'pointer',
                        textDecoration: day && isDisabled(day) ? 'line-through' : 'none',
                      }}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>

              {/* Today shortcut — hidden when today is outside the valid range */}
              {!isDisabled(today.getDate()) && today.getFullYear() === viewYear && today.getMonth() === viewMonth && (
                <div style={{ marginTop: 8, textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const t = new Date()
                      onChange(`${fmt2(t.getDate())}-${fmt2(t.getMonth()+1)}-${t.getFullYear()}`)
                      setOpen(false)
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', textDecoration: 'underline' }}
                  >
                    Today
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: 26, height: 26,
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
  color: 'var(--text-muted)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: 1,
}

const dayBtn: React.CSSProperties = {
  width: '100%',
  aspectRatio: '1',
  border: 'none',
  borderRadius: 6,
  fontSize: 11,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
}

const yearBtn: React.CSSProperties = {
  border: 'none',
  borderRadius: 6,
  padding: '5px 2px',
  fontSize: 11,
  cursor: 'pointer',
  textAlign: 'center',
}
