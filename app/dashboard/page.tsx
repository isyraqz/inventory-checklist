'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Item, ItemFormData, Category, Condition, ItemStatus } from '@/lib/types'
import DatePicker from '@/components/DatePicker'

const EMPTY_FORM: ItemFormData = {
  name: '',
  brand: '',
  serial: '',
  status: 'Available',
  condition: 'Good',
  assigned_to: '',
  category: 'IT',
  department: '',
  date_acquired: '',
  warranty_exp: '',
  last_checked: '',
  remarks: '',
  checked: false,
}

const STATUS_CLASS: Record<string, string> = {
  Available: 'b-available', 'In use': 'b-inuse', Maintenance: 'b-maintenance',
}
const COND_CLASS: Record<string, string> = {
  Good: 'b-good', Fair: 'b-fair', Poor: 'b-poor',
}

type SortKey = 'item_no' | 'name' | 'brand' | 'serial' | 'status' | 'condition' | 'assigned_to' | 'category' | 'department' | 'date_acquired' | 'warranty_exp' | 'last_checked' | 'remarks'

const COL_LABELS: { key: SortKey; label: React.ReactNode }[] = [
  { key: 'item_no', label: 'No' },
  { key: 'name', label: 'Item Name' },
  { key: 'brand', label: 'Brand' },
  { key: 'serial', label: 'Serial Number' },
  { key: 'status', label: 'Status' },
  { key: 'condition', label: 'Condition' },
  { key: 'assigned_to', label: 'Assigned To' },
  { key: 'category', label: 'Category' },
  { key: 'department', label: 'Department' },
  { key: 'date_acquired', label: <><span>Purchase</span><br/><span>Date</span></> },
  { key: 'warranty_exp', label: <><span>Warranty</span><br/><span>Exp</span></> },
  { key: 'last_checked', label: <><span>Last</span><br/><span>Checked</span></> },
  { key: 'remarks', label: 'Remarks' },
]

function fmtDate(val: string | null | undefined) {
  if (!val) return '—'
  return val.split('-').reverse().join('-')
}

// "DD-MM-YYYY" → "YYYY-MM-DD" for DB storage; returns '' if invalid
function toDBDate(dmy: string): string {
  if (!dmy) return ''
  const [d, m, y] = dmy.split('-')
  if (!d || !m || !y || y.length !== 4) return ''
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
}

// "YYYY-MM-DD" → "DD-MM-YYYY" for form display
function toFormDate(ymd: string | null | undefined): string {
  if (!ymd) return ''
  return ymd.split('-').reverse().join('-')
}

export default function Dashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('item_no')
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
    const { data } = await supabase.from('items').select('*').order('item_no', { ascending: true })
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
      brand: item.brand ?? '',
      serial: item.serial,
      status: item.status,
      condition: item.condition,
      assigned_to: item.assigned_to,
      category: item.category,
      department: item.department ?? '',
      date_acquired: toFormDate(item.date_acquired),
      warranty_exp: toFormDate(item.warranty_exp),
      last_checked: toFormDate(item.last_checked),
      remarks: item.remarks ?? '',
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

    const payload = {
      name: form.name,
      brand: form.brand,
      serial: form.serial,
      status: form.status,
      condition: form.condition,
      assigned_to: form.assigned_to,
      category: form.category,
      department: form.department,
      date_acquired: toDBDate(form.date_acquired) || null,
      warranty_exp: toDBDate(form.warranty_exp) || null,
      last_checked: toDBDate(form.last_checked) || null,
      remarks: form.remarks,
    }

    if (editId) {
      const { error } = await supabase
        .from('items')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editId)
      if (!error) { toast('Item updated'); await loadItems() }
    } else {
      const { error } = await supabase
        .from('items')
        .insert({ ...payload, user_id: user.id })
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
    const headers = ['No', 'Item Name', 'Brand', 'Serial Number', 'Status', 'Condition', 'Assigned To', 'Category', 'Department', 'Purchase Date', 'Warranty Exp', 'Last Checked', 'Remarks']
    const rows = items.map(i =>
      [
        String(i.item_no ?? '').padStart(3, '0'),
        i.name,
        i.brand ?? '',
        i.serial,
        i.status,
        i.condition,
        i.assigned_to,
        i.category,
        i.department ?? '',
        fmtDate(i.date_acquired),
        fmtDate(i.warranty_exp),
        fmtDate(i.last_checked),
        i.remarks ?? '',
      ]
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

  const departments = Array.from(new Set(items.map(i => i.department).filter(Boolean))).sort()

  const filtered = items
    .filter(i =>
      (!search || [i.name, i.brand, i.serial, i.assigned_to, i.department, i.remarks]
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

  const colSpanFull = COL_LABELS.length + (role === 'admin' ? 2 : 0)

  return (
    <>
      {/* Header */}
      <header className="app-header" style={role === 'admin' ? { background: '#1e3a5f', borderBottomColor: 'rgba(255,255,255,0.1)' } : {}}>
        <div className="logo" style={role === 'admin' ? { color: '#ffffff' } : {}}>
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
            <path d="M4 1.5A1.5 1.5 0 0 1 5.5 0h4.086a1.5 1.5 0 0 1 1.06.44l2.915 2.914A1.5 1.5 0 0 1 14 4.414V13.5A1.5 1.5 0 0 1 12.5 15h-7A1.5 1.5 0 0 1 4 13.5v-12Z" fill={role === 'admin' ? 'rgba(255,255,255,0.2)' : 'var(--surface2)'} stroke={role === 'admin' ? 'rgba(255,255,255,0.4)' : 'var(--border-strong)'} strokeWidth="1"/>
            <path d="M9.5 0v3.5A1.5 1.5 0 0 0 11 5h3" stroke={role === 'admin' ? 'rgba(255,255,255,0.4)' : 'var(--border-strong)'} strokeWidth="1" fill="none"/>
            <path d="M6 8h4M6 10.5h3" stroke={role === 'admin' ? 'rgba(255,255,255,0.6)' : 'var(--text-hint)'} strokeWidth="1" strokeLinecap="round"/>
          </svg>
          Verus Virtus — Inventory Checklist
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
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div className="search-wrap">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M6.5 1a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm4.472 9.33 3.35 3.35a.75.75 0 0 1-1.06 1.06L9.91 11.69a6.5 6.5 0 1 1 1.062-1.06Z" />
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="Search items, serial, brand, department…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                title="Clear search"
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-hint)', lineHeight: 1, fontSize: 13,
                  padding: 2, display: 'flex', alignItems: 'center',
                }}
              >
                ✕
              </button>
            )}
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option>Available</option>
            <option>In use</option>
            <option>Maintenance</option>
          </select>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">All categories</option>
            <option>IT</option>
            <option>Furniture</option>
            <option>Equipment</option>
            <option>Other</option>
          </select>
          <button className="btn" onClick={exportCSV}>
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1.25a.75.75 0 0 1 .75.75v6.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L7.25 8.19V2A.75.75 0 0 1 8 1.25ZM2 13.25a.75.75 0 0 0 0 1.5h12a.75.75 0 0 0 0-1.5H2Z" />
            </svg>
            Export CSV
          </button>
        </div>

        {/* Audit bar + Add button row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem' }}>
          {role === 'admin' && checkedCount > 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--accent)', borderRadius: 'var(--radius)', padding: '10px 16px', fontSize: 13 }}>
              <span style={{ color: 'var(--accent-fg)', fontWeight: 500 }}>✓ {checkedCount} item{checkedCount !== 1 ? 's' : ''} checked in for audit</span>
              <button onClick={clearAudit} style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 'var(--radius)', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)', color: 'var(--accent-fg)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Clear audit
              </button>
            </div>
          )}
          {role === 'admin' && (
            <button className="btn btn-primary" onClick={openModal} style={{ marginLeft: 'auto' }}>
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
              </svg>
              Add item
            </button>
          )}
        </div>

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
                    <td colSpan={colSpanFull}>
                      <div className="empty-state"><p>Loading…</p></div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={colSpanFull}>
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
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-hint)' }}>
                      {String(item.item_no ?? '').padStart(3, '0')}
                    </td>
                    <td className="item-name">{item.name}</td>
                    <td>{item.brand || '—'}</td>
                    <td className="mono">{item.serial || '—'}</td>
                    <td>
                      <span className={`badge ${STATUS_CLASS[item.status] ?? ''}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${COND_CLASS[item.condition] ?? ''}`}>
                        {item.condition}
                      </span>
                    </td>
                    <td>
                      {item.assigned_to || <span style={{ color: 'var(--text-hint)' }}>—</span>}
                    </td>
                    <td>{item.category}</td>
                    <td>{item.department || '—'}</td>
                    <td className="mono" style={{ fontSize: 10 }}>{fmtDate(item.date_acquired)}</td>
                    <td className="mono" style={{ fontSize: 10 }}>{fmtDate(item.warranty_exp)}</td>
                    <td className="mono" style={{ fontSize: 10 }}>{fmtDate(item.last_checked)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.remarks || '—'}
                    </td>
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
                <label>Brand</label>
                <input
                  type="text"
                  value={form.brand}
                  onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                  placeholder="e.g. Dell"
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
                <label>Department</label>
                <input
                  type="text"
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="e.g. IT, HR, Finance"
                />
              </div>
              <div className="form-field">
                <label>Purchase date</label>
                <DatePicker
                  value={form.date_acquired}
                  onChange={v => setForm(f => ({ ...f, date_acquired: v }))}
                />
              </div>
              <div className="form-field">
                <label>Warranty expiry</label>
                <DatePicker
                  value={form.warranty_exp}
                  onChange={v => setForm(f => ({ ...f, warranty_exp: v }))}
                />
              </div>
              <div className="form-field">
                <label>Last checked</label>
                <DatePicker
                  value={form.last_checked}
                  onChange={v => setForm(f => ({ ...f, last_checked: v }))}
                />
              </div>
              <div className="form-field full">
                <label>Remarks</label>
                <textarea
                  value={form.remarks}
                  onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
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
