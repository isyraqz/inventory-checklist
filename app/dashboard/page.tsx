'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Item, ItemFormData, Category, Condition, ItemStatus } from '@/lib/types'

const EMPTY_FORM: ItemFormData = {
  name: '',
  serial: '',
  assigned_to: '',
  category: 'IT',
  condition: 'Good',
  status: 'Available',
  location: '',
  date_acquired: '',
  notes: '',
  checked: false,
}

const CAT_CLASS: Record<string, string> = {
  IT: 'b-it', Furniture: 'b-furniture', Equipment: 'b-equipment', Other: 'b-other',
}
const COND_CLASS: Record<string, string> = {
  Good: 'b-good', Fair: 'b-fair', Poor: 'b-poor',
}
const STATUS_CLASS: Record<string, string> = {
  Available: 'b-available', 'In use': 'b-inuse', Maintenance: 'b-maintenance',
}

type SortKey = 'name' | 'serial' | 'assigned_to' | 'category' | 'condition' | 'status' | 'location' | 'date_acquired'

const COL_LABELS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Item name' },
  { key: 'serial', label: 'Serial no.' },
  { key: 'assigned_to', label: 'Assigned to' },
  { key: 'category', label: 'Category' },
  { key: 'condition', label: 'Condition' },
  { key: 'status', label: 'Status' },
  { key: 'location', label: 'Location' },
  { key: 'date_acquired', label: 'Date in' },
]

export default function Dashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<ItemFormData>({ ...EMPTY_FORM })
  const [nameError, setNameError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([])
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [userEmail, setUserEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer')
  const [auditChecked, setAuditChecked] = useState<Set<string>>(new Set())
  const [userId, setUserId] = useState<string | null>(null)
  const toastId = useRef(0)

  const loadItems = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('items').select('*').order('created_at', { ascending: false })
    setItems((data as Item[]) || [])
    setLoading(false)
  }, [supabase])

  const loadAuditChecks = useCallback(async (uid: string) => {
    const { data } = await supabase.from('audit_checks').select('item_id').eq('user_id', uid)
    setAuditChecked(new Set((data || []).map((r: { item_id: string }) => r.item_id)))
  }, [supabase])

  useEffect(() => {
    loadItems()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email)
      if (user) {
        setUserId(user.id)
        const { data } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        if (data?.role === 'admin') {
          setRole('admin')
          loadAuditChecks(user.id)
        }
      }
    })
    const saved = localStorage.getItem('inv_theme')
    if (saved === 'dark') {
      setTheme('dark')
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }, [loadItems, loadAuditChecks, supabase])

  function toast(msg: string) {
    const id = toastId.current++
    setToasts(t => [...t, { id, msg }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2800)
  }

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next === 'dark' ? 'dark' : '')
    localStorage.setItem('inv_theme', next)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function openModal() {
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setNameError(false)
    setModalOpen(true)
  }

  function openEdit(item: Item) {
    setEditId(item.id)
    setForm({
      name: item.name,
      serial: item.serial,
      assigned_to: item.assigned_to,
      category: item.category,
      condition: item.condition,
      status: item.status,
      location: item.location,
      date_acquired: item.date_acquired ?? '',
      notes: item.notes,
      checked: item.checked,
    })
    setNameError(false)
    setModalOpen(true)
  }

  async function saveItem() {
    if (!form.name.trim()) { setNameError(true); return }
    setNameError(false)
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    if (editId) {
      const { error } = await supabase
        .from('items')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', editId)
      if (!error) { toast('Item updated'); await loadItems() }
    } else {
      const { error } = await supabase
        .from('items')
        .insert({ ...form, user_id: user.id })
      if (!error) { toast('Item added'); await loadItems() }
    }
    setSaving(false)
    setModalOpen(false)
  }

  async function toggleItem(id: string) {
    if (!userId) return
    if (auditChecked.has(id)) {
      await supabase.from('audit_checks').delete().eq('user_id', userId).eq('item_id', id)
      setAuditChecked(prev => { const s = new Set(prev); s.delete(id); return s })
    } else {
      await supabase.from('audit_checks').insert({ user_id: userId, item_id: id })
      setAuditChecked(prev => new Set(prev).add(id))
    }
  }

  async function clearAudit() {
    if (!confirm('Clear all audit checks? This will uncheck all your items.')) return
    if (!userId) return
    await supabase.from('audit_checks').delete().eq('user_id', userId)
    setAuditChecked(new Set())
    toast('Audit cleared')
  }

  async function deleteItem(item: Item) {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    await supabase.from('items').delete().eq('id', item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
    toast('Item deleted')
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d * -1)
    else { setSortKey(key); setSortDir(1) }
  }

  function exportCSV() {
    const headers = ['Item', 'Serial No', 'Assigned To', 'Category', 'Condition', 'Status', 'Location', 'Date Acquired', 'Notes', 'Checked In']
    const rows = items.map(i =>
      [i.name, i.serial, i.assigned_to, i.category, i.condition, i.status, i.location, i.date_acquired ?? '', i.notes, i.checked ? 'Yes' : 'No']
        .map(v => `"${(v || '').replace(/"/g, '""')}"`)
        .join(',')
    )
    const csv = [headers.join(','), ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `inventory_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    toast('CSV exported')
  }

  const filtered = items
    .filter(i =>
      (!search || [i.name, i.serial, i.assigned_to, i.location, i.notes]
        .some(f => (f || '').toLowerCase().includes(search.toLowerCase()))) &&
      (!filterCat || i.category === filterCat) &&
      (!filterStatus || i.status === filterStatus)
    )
    .sort((a, b) => {
      const av = String(a[sortKey as keyof Item] ?? '').toLowerCase()
      const bv = String(b[sortKey as keyof Item] ?? '').toLowerCase()
      return av < bv ? -sortDir : av > bv ? sortDir : 0
    })

  const total = items.length
  const checkedCount = auditChecked.size
  const inuse = items.filter(i => i.status === 'In use').length
  const avail = items.filter(i => i.status === 'Available').length
  const maint = items.filter(i => i.status === 'Maintenance').length
  const pct = total ? Math.round(checkedCount / total * 100) : 0

  return (
    <>
      {/* Header */}
      <header className="app-header" style={role === 'admin' ? { background: '#1e3a5f', borderBottomColor: 'rgba(255,255,255,0.1)' } : {}}>
        <div className="logo" style={role === 'admin' ? { color: '#ffffff' } : {}}>
          <div className="logo-mark" style={role === 'admin' ? { background: 'rgba(255,255,255,0.15)' } : {}}>
            <svg viewBox="0 0 16 16"><path d="M2 3h12v1.5H2zm0 4h12v1.5H2zm0 4h8v1.5H2z" /></svg>
          </div>
          Inventory Checklist
        </div>
        <div className="header-right">
          {userEmail && (
            <span className="user-email" style={role === 'admin' ? { color: 'rgba(255,255,255,0.6)' } : {}}>
              {userEmail}{role === 'admin' && <span style={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}> (admin)</span>}
            </span>
          )}
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle dark mode"
            style={role === 'admin' ? { background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)', color: '#fff' } : {}}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="btn" onClick={signOut}
            style={role === 'admin' ? { background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)', color: '#fff' } : {}}>
            Sign out
          </button>
          {role === 'admin' && (
            <button className="btn btn-primary" onClick={openModal}
              style={{ background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }}>
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
              </svg>
              Add item
            </button>
          )}

        </div>
      </header>

      <main className="app-body">
        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Total items</div>
            <div className="stat-value">{total}</div>
          </div>
          {role === 'admin' && (
            <div className="stat-card">
              <div className="stat-label">Checked in <span style={{ fontWeight: 400, opacity: 0.6 }}>(for audit)</span></div>
              <div className="stat-value">{checkedCount}</div>
              <div className="stat-sub">{pct}% verified</div>
            </div>
          )}
          <div className="stat-card">
            <div className="stat-label">In use</div>
            <div className="stat-value">{inuse}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Available</div>
            <div className="stat-value">{avail}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Maintenance</div>
            <div className="stat-value">{maint}</div>
          </div>
        </div>

        {/* Progress */}
        {role === 'admin' && (
          <div className="progress-row">
            <div className="progress-meta">
              <span>Check-in progress</span>
              <strong>{pct}%</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="toolbar">
          <div className="search-wrap">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M6.5 1a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm4.472 9.33 3.35 3.35a.75.75 0 0 1-1.06 1.06L9.91 11.69a6.5 6.5 0 1 1 1.062-1.06Z" />
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="Search items, serial, user, location…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">All categories</option>
            <option>IT</option>
            <option>Furniture</option>
            <option>Equipment</option>
            <option>Other</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option>Available</option>
            <option>In use</option>
            <option>Maintenance</option>
          </select>
          <button className="btn" onClick={exportCSV}>
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1.25a.75.75 0 0 1 .75.75v6.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L7.25 8.19V2A.75.75 0 0 1 8 1.25ZM2 13.25a.75.75 0 0 0 0 1.5h12a.75.75 0 0 0 0-1.5H2Z" />
            </svg>
            Export CSV
          </button>
        </div>

        {/* Audit bar */}
        {role === 'admin' && checkedCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--accent)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '0.75rem', fontSize: 13 }}>
            <span style={{ color: 'var(--accent-fg)', fontWeight: 500 }}>✓ {checkedCount} item{checkedCount !== 1 ? 's' : ''} checked in for audit</span>
            <button onClick={clearAudit} style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 'var(--radius)', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)', color: 'var(--accent-fg)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Clear audit
            </button>
          </div>
        )}

        {/* Table */}
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {role === 'admin' && <th style={{ width: 36, cursor: 'default' }} />}
                  {COL_LABELS.map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className={sortKey === key ? (sortDir === 1 ? 'sort-asc' : 'sort-desc') : ''}
                    >
                      {label}
                    </th>
                  ))}
                  {role === 'admin' && <th style={{ cursor: 'default', width: 80 }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty-state"><p>Loading…</p></div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty-state">
                        <div className="empty-icon">📦</div>
                        <p>No items found. Try adjusting your search or filters.</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(item => (
                  <tr key={item.id} className={role === 'admin' && auditChecked.has(item.id) ? 'row-checked' : ''}>
                    {role === 'admin' && (
                      <td className="no-strike">
                        <input
                          type="checkbox"
                          checked={auditChecked.has(item.id)}
                          onChange={() => toggleItem(item.id)}
                        />
                      </td>
                    )}
                    <td className="item-name">{item.name}</td>
                    <td className="mono">{item.serial || '—'}</td>
                    <td>
                      {item.assigned_to || (
                        <span style={{ color: 'var(--text-hint)' }}>Unassigned</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${CAT_CLASS[item.category] ?? 'b-other'}`}>
                        {item.category}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${COND_CLASS[item.condition] ?? 'b-other'}`}>
                        {item.condition}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_CLASS[item.status] ?? 'b-other'}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>{item.location || '—'}</td>
                    <td className="mono">{item.date_acquired ? item.date_acquired.split('-').reverse().join('-') : '—'}</td>
                    {role === 'admin' && (
                      <td className="no-strike">
                        <div className="actions">
                          <button className="icon-btn" title="Edit" onClick={() => openEdit(item)}>✎</button>
                          <button className="icon-btn del" title="Delete" onClick={() => deleteItem(item)}>✕</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <footer className="app-footer">
        Inventory Checklist — data stored in Supabase, isolated per account
      </footer>

      {/* Modal */}
      {modalOpen && (
        <div
          className="modal-overlay open"
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          <div className="modal">
            <div className="modal-header">
              <h2>{editId ? 'Edit item' : 'Add inventory item'}</h2>
              <button className="modal-close" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="form-grid">
              <div className="form-field full">
                <label>Item name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Dell Latitude 5520"
                  className={nameError ? 'error' : ''}
                  autoFocus
                />
              </div>
              <div className="form-field">
                <label>Serial number</label>
                <input
                  type="text"
                  value={form.serial}
                  onChange={e => setForm(f => ({ ...f, serial: e.target.value }))}
                  placeholder="e.g. SN-DL5520-001"
                />
              </div>
              <div className="form-field">
                <label>Assigned to</label>
                <input
                  type="text"
                  value={form.assigned_to}
                  onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                  placeholder="e.g. John Doe"
                />
              </div>
              <div className="form-field">
                <label>Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))}
                >
                  <option>IT</option>
                  <option>Furniture</option>
                  <option>Equipment</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="form-field">
                <label>Condition</label>
                <select
                  value={form.condition}
                  onChange={e => setForm(f => ({ ...f, condition: e.target.value as Condition }))}
                >
                  <option>Good</option>
                  <option>Fair</option>
                  <option>Poor</option>
                </select>
              </div>
              <div className="form-field">
                <label>Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as ItemStatus }))}
                >
                  <option>Available</option>
                  <option>In use</option>
                  <option>Maintenance</option>
                </select>
              </div>
              <div className="form-field">
                <label>Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Office A"
                />
              </div>
              <div className="form-field">
                <label>Date acquired</label>
                <input
                  type="date"
                  value={form.date_acquired}
                  onChange={e => setForm(f => ({ ...f, date_acquired: e.target.value }))}
                />
              </div>
              <div className="form-field full">
                <label>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any additional details…"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveItem} disabled={saving}>
                {saving ? 'Saving…' : 'Save item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className="toast">{t.msg}</div>
        ))}
      </div>
    </>
  )
}
