'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { Item } from '@/lib/types'

const CAT_COLORS  = ['#1e3a5f', '#2f6fa5', '#5fa8d3', '#a8d5f0']
const STAT_COLORS: Record<string, string> = {
  Available:   '#276b3a',
  'In use':    '#888888',
  Maintenance: '#b91c1c',
}

function DonutChart({ data, colors }: { data: { name: string; value: number }[]; colors: string[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={72}
            paddingAngle={2}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(val: number) => [`${val} (${Math.round(val / total * 100)}%)`, '']}
            contentStyle={{ fontFamily: 'var(--font)', fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
        {data.map((d, i) => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <div style={{ width: 8, height: 8, borderRadius: 99, background: colors[i % colors.length], flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'var(--text-muted)' }}>{d.name}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-hint)' }}>
              {d.value} · {Math.round(d.value / total * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BrandBars({ items }: { items: Item[] }) {
  const map: Record<string, number> = {}
  items.forEach(i => {
    const b = (i.brand || 'Unknown').trim()
    map[b] = (map[b] || 0) + 1
  })
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 7)
  const max = sorted[0]?.[1] || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sorted.map(([brand, count]) => (
        <div key={brand}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11 }}>
            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{brand}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-hint)' }}>{count}</span>
          </div>
          <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round(count / max * 100)}%`, background: '#1e3a5f', borderRadius: 99, transition: 'width .4s ease' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

interface Props {
  items: Item[]
}

export default function ChartPanel({ items }: Props) {
  const catData = ['IT', 'Furniture', 'Equipment', 'Other']
    .map(cat => ({ name: cat, value: items.filter(i => i.category === cat).length }))
    .filter(d => d.value > 0)

  const statusData = ['Available', 'In use', 'Maintenance']
    .map(s => ({ name: s, value: items.filter(i => i.status === s).length }))
    .filter(d => d.value > 0)

  const statusColors = statusData.map(d => STAT_COLORS[d.name])

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px 24px',
      marginBottom: '1rem',
      boxShadow: 'var(--shadow)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Inventory Overview</div>
          <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 2 }}>Based on {items.length} items</div>
        </div>
      </div>

      <div className="chart-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 8 }}>
            By Category
          </div>
          <DonutChart data={catData} colors={CAT_COLORS} />
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 8 }}>
            By Status
          </div>
          <DonutChart data={statusData} colors={statusColors} />
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 12 }}>
            By Brand
          </div>
          <BrandBars items={items} />
        </div>
      </div>
    </div>
  )
}
