'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Item, ItemFormData, Category, Condition, ItemStatus, MaintenanceLog, UserHistory, ItemPhoto } from '@/lib/types'
import DatePicker from '@/components/DatePicker'
import ChartPanel from '@/components/ChartPanel'

const EMPTY_FORM: ItemFormData = {
  name: '', brand: '', serial: '', status: 'Available', condition: 'Good',
  assigned_to: '', category: 'IT', department: '', date_acquired: '',
  purchased_date: '', warranty_exp: '', last_checked: '', remarks: '', checked: false,
}

const STATUS_CLASS: Record<string, string> = {
  Available: 'b-available', 'In use': 'b-inuse', Maintenance: 'b-maintenance',
}
const COND_CLASS: Record<string, string> = {
  Good: 'b-good', Fair: 'b-fair', Poor: 'b-poor',
}

type SortKey = 'name' | 'brand' | 'status' | 'assigned_to' | 'date_acquired' | 'remarks'

const COL_LABELS: { key: SortKey; label: string }[] = [
  { key: 'name',          label: 'Item Name' },
  { key: 'brand',         label: 'Brand' },
  { key: 'assigned_to',   label: 'Assigned To' },
  { key: 'status',        label: 'Status' },
  { key: 'date_acquired', label: 'Issue Date' },
  { key: 'remarks',       label: 'Remarks' },
]

function fmtDate(val: string | null | undefined) {
  if (!val) return '—'
  return val.split('-').reverse().join('-')
}
function toDBDate(dmy: string): string {
  if (!dmy) return ''
  const [d, m, y] = dmy.split('-')
  if (!d || !m || !y || y.length !== 4) return ''
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}
function toFormDate(ymd: string | null | undefined): string {
  if (!ymd) return ''
  return ymd.split('-').reverse().join('-')
}

// ── CSV helpers ──
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  result.push(cur.trim())
  return result
}
function parseCSV(text: string): Partial<ItemFormData>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/"/g, '').trim().toLowerCase())
  const get = (vals: string[], names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n)
      if (i >= 0) return (vals[i] || '').replace(/^"|"$/g, '').trim()
    }
    return ''
  }
  return lines.slice(1).map(line => {
    const v = parseCSVLine(line)
    return {
      name: get(v, ['item name', 'name']),
      brand: get(v, ['brand']),
      serial: get(v, ['serial number', 'serial']),
      status: (get(v, ['status']) as ItemStatus) || 'Available',
      condition: (get(v, ['condition']) as Condition) || 'Good',
      assigned_to: get(v, ['assigned to', 'assigned_to']),
      category: (get(v, ['category']) as Category) || 'IT',
      department: get(v, ['department']),
      date_acquired: get(v, ['issue date', 'issued date', 'date acquired', 'date_acquired']),
      warranty_exp: get(v, ['warranty exp', 'warranty_exp']),
      last_checked: get(v, ['last checked', 'last_checked']),
      remarks: get(v, ['remarks']),
      checked: false,
    }
  }).filter(r => !!r.name)
}

export default function Dashboard() {
  const router = useRouter()
  const supabase = createClient()

  // ── Core state ──
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('brand')
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
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [showCharts, setShowCharts] = useState(false)
  const [logs, setLogs] = useState<MaintenanceLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logInput, setLogInput] = useState('')
  const [logSaving, setLogSaving] = useState(false)
  const [userHistory, setUserHistory] = useState<UserHistory[]>([])
  const [uhLoading, setUhLoading] = useState(false)
  const [uhForm, setUhForm] = useState({ user_name: '', date_from: '', date_to: '' })
  const [uhSaving, setUhSaving] = useState(false)

  // ── New UX state ──
  const [panelEditMode, setPanelEditMode] = useState(false)
  const [panelForm, setPanelForm] = useState<Partial<ItemFormData>>({})
  const [panelSaving, setPanelSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<Partial<ItemFormData>[]>([])
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [photos, setPhotos] = useState<ItemPhoto[]>([])
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const toastId = useRef(0)
  const importInputRef = useRef<HTMLInputElement>(null)
  // Ref snapshot for keyboard handler (avoids stale closures)
  const snap = useRef({ selectedItem: null as Item | null, role: 'viewer' as 'admin' | 'viewer', modalOpen: false, importOpen: false, panelEditMode: false, filtered: [] as Item[] })

  // ── Data loading ──
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

  const loadLogs = useCallback(async (itemId: string) => {
    setLogsLoading(true)
    const { data } = await supabase.from('maintenance_logs').select('*').eq('item_id', itemId).order('created_at', { ascending: false })
    setLogs((data as MaintenanceLog[]) || [])
    setLogsLoading(false)
  }, [supabase])

  const loadUserHistory = useCallback(async (itemId: string) => {
    setUhLoading(true)
    const { data } = await supabase.from('item_user_history').select('*').eq('item_id', itemId).order('date_from', { ascending: false })
    setUserHistory((data as UserHistory[]) || [])
    setUhLoading(false)
  }, [supabase])

  const loadPhotos = useCallback(async (itemId: string) => {
    setPhotosLoading(true)
    const { data } = await supabase.from('item_photos').select('*').eq('item_id', itemId).order('uploaded_at', { ascending: false })
    setPhotos((data as ItemPhoto[]) || [])
    setPhotosLoading(false)
  }, [supabase])

  useEffect(() => {
    loadItems()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email)
      if (user) {
        setUserId(user.id)
        const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (data?.role === 'admin') { setRole('admin'); loadAuditChecks(user.id) }
      }
    })
    const saved = localStorage.getItem('inv_theme')
    if (saved === 'dark') { setTheme('dark'); document.documentElement.setAttribute('data-theme', 'dark') }
  }, [loadItems, loadAuditChecks, supabase])

  useEffect(() => {
    if (selectedItem) {
      setLogInput(''); setUhForm({ user_name: '', date_from: '', date_to: '' })
      loadLogs(selectedItem.id); loadUserHistory(selectedItem.id); loadPhotos(selectedItem.id)
      setPanelEditMode(false); setEditingField(null)
    } else {
      setLogs([]); setUserHistory([]); setPhotos([]); setEditingField(null)
    }
  }, [selectedItem, loadLogs, loadUserHistory, loadPhotos])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const { selectedItem, role, modalOpen, importOpen, panelEditMode, filtered } = snap.current
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (modalOpen || importOpen || panelEditMode) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIdx(i => {
          const next = Math.min(i + 1, filtered.length - 1)
          if (filtered[next]) setSelectedItem(filtered[next])
          return next
        })
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIdx(i => {
          const next = Math.max(i - 1, 0)
          if (filtered[next]) setSelectedItem(filtered[next])
          return next
        })
      }
      if (e.key === 'Escape') {
        setSelectedItem(null); setPanelEditMode(false)
      }
      if ((e.key === 'e' || e.key === 'E') && selectedItem && role === 'admin') {
        e.preventDefault()
        // trigger openModal(selectedItem) via flag — handled below
        setModalOpen(true)
      }
      if (e.key === 'Delete' && selectedItem && role === 'admin') {
        e.preventDefault()
        if (confirm(`Delete "${selectedItem.name}"? This cannot be undone.`)) {
          supabase.from('items').delete().eq('id', selectedItem.id).then(() => {
            setItems(prev => prev.filter(i => i.id !== selectedItem.id))
            setSelectedItem(null)
            const id = toastId.current++
            setToasts(t => [...t, { id, msg: 'Item deleted' }])
            setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2800)
          })
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ──
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
  async function signOut() { await supabase.auth.signOut(); router.push('/login') }

  // ── Modal (full edit) ──
  function openModal(item?: Item) {
    if (item) {
      setEditId(item.id)
      setForm({
        name: item.name, brand: item.brand ?? '', serial: item.serial,
        status: item.status, condition: item.condition, assigned_to: item.assigned_to,
        category: item.category, department: item.department ?? '',
        date_acquired: toFormDate(item.date_acquired),
        purchased_date: toFormDate(item.purchased_date),
        warranty_exp: toFormDate(item.warranty_exp),
        last_checked: toFormDate(item.last_checked),
        remarks: item.remarks ?? '', checked: item.checked,
      })
      setUhForm({ user_name: item.assigned_to ?? '', date_from: toFormDate(item.date_acquired), date_to: '' })
    } else {
      setEditId(null); setForm({ ...EMPTY_FORM })
      setUhForm({ user_name: '', date_from: '', date_to: '' })
    }
    setNameError(false); setModalOpen(true)
  }

  async function saveItem() {
    if (!form.name.trim()) { setNameError(true); return }
    setNameError(false); setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const payload = {
      name: form.name, brand: form.brand, serial: form.serial, status: form.status,
      condition: form.condition, assigned_to: form.assigned_to, category: form.category,
      department: form.department, date_acquired: toDBDate(form.date_acquired) || null,
      purchased_date: toDBDate(form.purchased_date) || null,
      warranty_exp: toDBDate(form.warranty_exp) || null,
      last_checked: toDBDate(form.last_checked) || null, remarks: form.remarks,
    }
    if (editId) {
      const { error } = await supabase.from('items').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editId)
      if (!error) { toast('Item updated'); await loadItems(); setSelectedItem(prev => prev?.id === editId ? { ...prev, ...payload } as Item : prev) }
    } else {
      const { error } = await supabase.from('items').insert({ ...payload, user_id: user.id })
      if (!error) { toast('Item added'); await loadItems() }
    }
    setSaving(false); setModalOpen(false)
  }

  // ── Audit ──
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
    if (!confirm('Clear all audit checks?')) return
    if (!userId) return
    await supabase.from('audit_checks').delete().eq('user_id', userId)
    setAuditChecked(new Set()); toast('Audit cleared')
  }

  // ── History / Log ──
  async function addUserHistory() {
    if (!uhForm.user_name.trim() || !selectedItem) return
    setUhSaving(true)
    const { error } = await supabase.from('item_user_history').insert({
      item_id: selectedItem.id, user_name: uhForm.user_name.trim(),
      date_from: toDBDate(uhForm.date_from) || null, date_to: toDBDate(uhForm.date_to) || null,
    })
    if (!error) { setUhForm({ user_name: '', date_from: '', date_to: '' }); await loadUserHistory(selectedItem.id); toast('User history added') }
    setUhSaving(false)
  }
  async function addLog() {
    if (!logInput.trim() || !selectedItem || !userId) return
    setLogSaving(true)
    const { error } = await supabase.from('maintenance_logs').insert({
      item_id: selectedItem.id, user_id: userId, logged_by: userEmail, description: logInput.trim(),
    })
    if (!error) { setLogInput(''); await loadLogs(selectedItem.id); toast('Log added') }
    setLogSaving(false)
  }

  async function deleteItem(item: Item) {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    await supabase.from('items').delete().eq('id', item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
    if (selectedItem?.id === item.id) setSelectedItem(null)
    toast('Item deleted')
  }

  // ── Panel quick edit ──
  // ── Photo upload / delete ──
  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file || !selectedItem) return
    setPhotoUploading(true)
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${user.id}/${selectedItem.id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('item-photos').upload(path, file)
    if (upErr) { toast('Upload failed: ' + upErr.message); setPhotoUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('item-photos').getPublicUrl(path)
    await supabase.from('item_photos').insert({ item_id: selectedItem.id, user_id: user.id, storage_path: path, url: publicUrl })
    await loadPhotos(selectedItem.id)
    setPhotoUploading(false); toast('Photo uploaded')
  }
  async function deletePhoto(photo: ItemPhoto) {
    if (!confirm('Delete this photo?')) return
    await supabase.storage.from('item-photos').remove([photo.storage_path])
    await supabase.from('item_photos').delete().eq('id', photo.id)
    setPhotos(prev => prev.filter(p => p.id !== photo.id))
    toast('Photo deleted')
  }

  const DATE_FIELDS = new Set(['date_acquired', 'purchased_date', 'warranty_exp', 'last_checked'])

  async function saveField(field: string, raw: string) {
    if (!selectedItem) return
    const value = DATE_FIELDS.has(field) ? (toDBDate(raw) || null) : raw
    await supabase.from('items').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', selectedItem.id)
    const updated = { ...selectedItem, [field]: value }
    setSelectedItem(updated)
    setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, [field]: value } : i))
    setEditingField(null)
    toast('Saved')
  }

  function startEdit(field: string, current: string | null) {
    if (role !== 'admin') return
    setEditingField(field)
    setEditingValue(DATE_FIELDS.has(field) ? toFormDate(current) : (current ?? ''))
  }

  function startPanelEdit() {
    if (!selectedItem) return
    setPanelForm({
      name: selectedItem.name, brand: selectedItem.brand ?? '', serial: selectedItem.serial,
      status: selectedItem.status, condition: selectedItem.condition, assigned_to: selectedItem.assigned_to,
      category: selectedItem.category, department: selectedItem.department ?? '',
      date_acquired: toFormDate(selectedItem.date_acquired),
      warranty_exp: toFormDate(selectedItem.warranty_exp),
      last_checked: toFormDate(selectedItem.last_checked),
      remarks: selectedItem.remarks ?? '',
    })
    setPanelEditMode(true)
  }
  async function savePanelEdit() {
    if (!selectedItem || !panelForm.name?.trim()) return
    setPanelSaving(true)
    const payload = {
      name: panelForm.name, brand: panelForm.brand, serial: panelForm.serial,
      status: panelForm.status, condition: panelForm.condition, assigned_to: panelForm.assigned_to,
      category: panelForm.category, department: panelForm.department,
      date_acquired: toDBDate(panelForm.date_acquired || '') || null,
      warranty_exp: toDBDate(panelForm.warranty_exp || '') || null,
      last_checked: toDBDate(panelForm.last_checked || '') || null,
      remarks: panelForm.remarks, updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('items').update(payload).eq('id', selectedItem.id)
    if (!error) { toast('Item updated'); await loadItems(); setSelectedItem({ ...selectedItem, ...payload } as Item); setPanelEditMode(false) }
    setPanelSaving(false)
  }

  // ── Bulk actions (operate on auditChecked) ──
  function toggleSelectAll() {
    if (auditChecked.size === filtered.length && filtered.length > 0) {
      clearAudit()
    } else {
      filtered.forEach(item => { if (!auditChecked.has(item.id)) toggleItem(item.id) })
    }
  }
  async function bulkDelete() {
    const ids = Array.from(auditChecked)
    const count = ids.length
    if (!confirm(`Delete ${count} item${count !== 1 ? 's' : ''}? This cannot be undone.`)) return
    await supabase.from('items').delete().in('id', ids)
    if (selectedItem && auditChecked.has(selectedItem.id)) setSelectedItem(null)
    await loadItems(); clearAudit(); toast(`${count} item${count !== 1 ? 's' : ''} deleted`)
  }
  async function bulkSetStatus(status: ItemStatus) {
    const ids = Array.from(auditChecked)
    const count = ids.length
    await supabase.from('items').update({ status, updated_at: new Date().toISOString() }).in('id', ids)
    await loadItems(); clearAudit(); toast(`${count} item${count !== 1 ? 's' : ''} set to ${status}`)
  }

  // ── CSV import ──
  function handleCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const rows = parseCSV(text)
      setImportRows(rows)
      setImportError(rows.length === 0 ? 'No valid rows found. Make sure your CSV has an "Item Name" column.' : '')
      setImportOpen(true)
    }
    reader.readAsText(file); e.target.value = ''
  }
  async function confirmImport() {
    setImporting(true)
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const inserts = importRows.map(r => ({
      ...r, user_id: user.id,
      date_acquired: toDBDate(r.date_acquired || '') || null,
      warranty_exp: toDBDate(r.warranty_exp || '') || null,
      last_checked: toDBDate(r.last_checked || '') || null,
      purchased_date: null,
    }))
    const { error } = await supabase.from('items').insert(inserts)
    if (!error) {
      toast(`${importRows.length} item${importRows.length !== 1 ? 's' : ''} imported`)
      await loadItems(); setImportOpen(false); setImportRows([])
    } else { setImportError(error.message) }
    setImporting(false)
  }

  // ── Sort / filter ──
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d * -1)
    else { setSortKey(key); setSortDir(1) }
  }

  function exportCSV() {
    const headers = ['No', 'Item Name', 'Brand', 'Serial Number', 'Status', 'Condition', 'Assigned To', 'Category', 'Department', 'Issue Date', 'Warranty Exp', 'Last Checked', 'Remarks']
    const rows = items.map(i =>
      [String(i.item_no ?? '').padStart(3, '0'), i.name, i.brand ?? '', i.serial,
        i.status, i.condition, i.assigned_to, i.category, i.department ?? '',
        fmtDate(i.date_acquired), fmtDate(i.warranty_exp), fmtDate(i.last_checked), i.remarks ?? '']
        .map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',')
    )
    const csv = [headers.join(','), ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `inventory_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); toast('CSV exported')
  }

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

  // Keep snap updated for keyboard handler
  snap.current = { selectedItem, role, modalOpen, importOpen, panelEditMode, filtered }

  const total = items.length
  const checkedCount = auditChecked.size
  const avail = items.filter(i => i.status === 'Available').length
  const maint = items.filter(i => i.status === 'Maintenance').length
  const pct = total ? Math.round(checkedCount / total * 100) : 0
  const colSpanFull = COL_LABELS.length + 1 + (role === 'admin' ? 1 : 0)

  const isAdminHeader = role === 'admin'
  const adminStyle = (extra?: React.CSSProperties): React.CSSProperties =>
    isAdminHeader ? { background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)', color: '#fff', ...extra } : {}

  return (
    <>
      {/* Header */}
      <header className="app-header" style={isAdminHeader ? { background: '#1e3a5f', borderBottomColor: 'rgba(255,255,255,0.1)' } : {}}>
        <div className="logo" style={isAdminHeader ? { color: '#ffffff' } : {}}>
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <path d="M4 1.5A1.5 1.5 0 0 1 5.5 0h4.086a1.5 1.5 0 0 1 1.06.44l2.915 2.914A1.5 1.5 0 0 1 14 4.414V13.5A1.5 1.5 0 0 1 12.5 15h-7A1.5 1.5 0 0 1 4 13.5v-12Z"
              fill={isAdminHeader ? 'rgba(255,255,255,0.2)' : 'var(--surface2)'} stroke={isAdminHeader ? 'rgba(255,255,255,0.4)' : 'var(--border-strong)'} strokeWidth="1"/>
            <path d="M9.5 0v3.5A1.5 1.5 0 0 0 11 5h3" stroke={isAdminHeader ? 'rgba(255,255,255,0.4)' : 'var(--border-strong)'} strokeWidth="1" fill="none"/>
            <path d="M6 8h4M6 10.5h3" stroke={isAdminHeader ? 'rgba(255,255,255,0.6)' : 'var(--text-hint)'} strokeWidth="1" strokeLinecap="round"/>
          </svg>
          <span className="logo-text">Verus Virtus — Inventory Checklist</span>
        </div>
        <div className="header-right">
          {userEmail && (
            <span className="user-email" style={isAdminHeader ? { color: 'rgba(255,255,255,0.6)' } : {}}>
              {userEmail}{isAdminHeader && <span style={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}> (admin)</span>}
            </span>
          )}
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle dark mode" style={adminStyle()}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="btn" onClick={signOut} style={adminStyle()}>Sign out</button>
        </div>
      </header>

      <div className="dashboard-layout">
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
            <div className="stat-card" style={{ background: '#e6f4ea', borderColor: '#c3e6cb' }}>
              <div className="stat-label" style={{ color: '#276b3a' }}>Available</div>
              <div className="stat-value" style={{ color: '#276b3a' }}>{avail}</div>
            </div>
            <div className="stat-card" style={{ background: '#fce8e8', borderColor: '#f5c6c6' }}>
              <div className="stat-label" style={{ color: '#b91c1c' }}>Maintenance</div>
              <div className="stat-value" style={{ color: '#b91c1c' }}>{maint}</div>
            </div>
          </div>

          {/* Progress */}
          {role === 'admin' && (
            <div className="progress-row">
              <div className="progress-meta"><span>Check-in progress</span><strong>{pct}%</strong></div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
            </div>
          )}

          {/* Toolbar */}
          <div className="toolbar">
            <div className="search-wrap">
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.5 1a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm4.472 9.33 3.35 3.35a.75.75 0 0 1-1.06 1.06L9.91 11.69a6.5 6.5 0 1 1 1.062-1.06Z" />
              </svg>
              <input type="text" className="search-input" placeholder="Search items, serial, brand, department…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && (
                <button type="button" onClick={() => setSearch('')} title="Clear"
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-hint)', fontSize: 13, padding: 2, display: 'flex', alignItems: 'center' }}>✕</button>
              )}
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option>Available</option><option>In use</option><option>Maintenance</option>
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">All categories</option>
              <option>IT</option><option>Furniture</option><option>Equipment</option><option>Other</option>
            </select>
            <button className="btn" onClick={() => setShowCharts(s => !s)}
              style={showCharts ? { background: '#1e3a5f', color: '#fff', borderColor: '#1e3a5f' } : { borderColor: '#1e3a5f', color: '#1e3a5f' }}>
              <svg viewBox="0 0 16 16" fill="currentColor" style={{ width: 13, height: 13 }}>
                <path d="M1 11a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-3Zm5-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Zm5-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V3Z"/>
              </svg>
              Charts
            </button>
            <button className="btn" onClick={exportCSV}>
              <svg viewBox="0 0 16 16" fill="currentColor" style={{ width: 13, height: 13 }}>
                <path d="M8 1.25a.75.75 0 0 1 .75.75v6.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L7.25 8.19V2A.75.75 0 0 1 8 1.25ZM2 13.25a.75.75 0 0 0 0 1.5h12a.75.75 0 0 0 0-1.5H2Z" />
              </svg>
              Export
            </button>
            {role === 'admin' && (
              <>
                <button className="btn" onClick={() => importInputRef.current?.click()}
                  title="Import items from CSV">
                  <svg viewBox="0 0 16 16" fill="currentColor" style={{ width: 13, height: 13 }}>
                    <path d="M8 1.25a.75.75 0 0 1 .75.75v6.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L7.25 8.19V2A.75.75 0 0 1 8 1.25ZM2 13.25a.75.75 0 0 0 0 1.5h12a.75.75 0 0 0 0-1.5H2Z"
                      transform="rotate(180 8 8)" />
                  </svg>
                  Import
                </button>
                <input ref={importInputRef} type="file" accept=".csv,.txt" onChange={handleCSVFile} style={{ display: 'none' }} />
              </>
            )}
          </div>

          {showCharts && <ChartPanel items={items} />}

          {/* Bulk action bar — appears automatically when 2+ items are checked */}
          {auditChecked.size > 1 && (
            <div className="bulk-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox"
                  checked={auditChecked.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll} />
                <span style={{ fontWeight: 500 }}>{auditChecked.size} item{auditChecked.size !== 1 ? 's' : ''} selected</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select defaultValue="" onChange={e => { if (e.target.value) { bulkSetStatus(e.target.value as ItemStatus); e.currentTarget.value = '' } }}
                  style={{ height: 32, fontSize: 12 }}>
                  <option value="" disabled>Set status…</option>
                  <option>Available</option><option>In use</option><option>Maintenance</option>
                </select>
                <button className="btn" onClick={bulkDelete}
                  style={{ height: 32, color: '#b91c1c', borderColor: 'rgba(185,28,28,0.3)', padding: '0 12px', fontSize: 12 }}>
                  Delete {auditChecked.size}
                </button>
              </div>
            </div>
          )}

          {/* Audit bar + Add button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem' }}>
            {role === 'admin' && checkedCount > 0 && auditChecked.size < 2 && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--accent)', borderRadius: 'var(--radius)', padding: '10px 16px', fontSize: 13 }}>
                <span style={{ color: 'var(--accent-fg)', fontWeight: 500 }}>✓ {checkedCount} item{checkedCount !== 1 ? 's' : ''} checked in for audit</span>
                <button onClick={clearAudit} style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 'var(--radius)', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)', color: 'var(--accent-fg)', cursor: 'pointer' }}>
                  Clear audit
                </button>
              </div>
            )}
            {role === 'admin' && (
              <button className="btn btn-primary" onClick={() => openModal()} style={{ marginLeft: 'auto' }}>
                <svg viewBox="0 0 16 16" fill="currentColor" style={{ width: 13, height: 13 }}>
                  <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
                </svg>
                Add item
              </button>
            )}
          </div>

          {/* Desktop table */}
          <div className="table-card">
            <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {role === 'admin' && (
                    <th style={{ width: 36, cursor: 'default' }} />
                  )}
                  <th style={{ width: 48, cursor: 'default', color: 'var(--text-hint)' }}>No</th>
                  {COL_LABELS.map(({ key, label }) => {
                    const colCls: Record<string, string> = { date_acquired: 'col-date', remarks: 'col-remarks' }
                    const sortCls = sortKey === key ? (sortDir === 1 ? 'sort-asc' : 'sort-desc') : ''
                    return (
                      <th key={key} onClick={() => handleSort(key)}
                        className={[sortCls, colCls[key] ?? ''].filter(Boolean).join(' ')}>
                        {label}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={colSpanFull}><div className="empty-state"><p>Loading…</p></div></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={colSpanFull}>
                    <div className="empty-state">
                      <div className="empty-icon">📦</div>
                      <p>No items found. Try adjusting your search or filters.</p>
                    </div>
                  </td></tr>
                ) : filtered.map((item, idx) => (
                  <tr key={item.id}
                    onClick={() => { setSelectedItem(prev => prev?.id === item.id ? null : item); setFocusedIdx(idx) }}
                    className={[
                      role === 'admin' && auditChecked.has(item.id) ? 'row-checked' : '',
                      selectedItem?.id === item.id ? 'row-selected' : '',
                    ].filter(Boolean).join(' ')}>
                    {role === 'admin' && (
                      <td className="no-strike" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={auditChecked.has(item.id)} onChange={() => toggleItem(item.id)} />
                      </td>
                    )}
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-hint)' }}>{String(idx + 1).padStart(3, '0')}</td>
                    <td className="item-name">{item.name}</td>
                    <td>{item.brand || <span style={{ color: 'var(--text-hint)' }}>—</span>}</td>
                    <td>{item.assigned_to || <span style={{ color: 'var(--text-hint)' }}>—</span>}</td>
                    <td><span className={`badge ${STATUS_CLASS[item.status] ?? ''}`}>{item.status}</span></td>
                    <td className="col-date mono" style={{ fontSize: 11 }}>{fmtDate(item.date_acquired)}</td>
                    <td className="col-remarks" style={{ color: 'var(--text-muted)', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.remarks || <span style={{ color: 'var(--text-hint)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>{/* end table-scroll */}
          </div>

          {/* Keyboard shortcut hint */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '10px 2px 0', fontSize: 11, color: 'var(--text-hint)' }}>
            {[['↑↓', 'Navigate'], ['E', 'Edit'], ['Esc', 'Close']].map(([k, l]) => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontFamily: 'var(--mono)', fontSize: 10 }}>{k}</span>
                {l}
              </span>
            ))}
          </div>
        </main>

        {/* Detail Panel */}
        <aside className={`detail-panel${selectedItem ? ' open' : ''}`}>
          {selectedItem && (
            <>
              <div className="panel-header">
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingField === 'name' && !panelEditMode
                    ? <input autoFocus type="text" value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        onBlur={() => saveField('name', editingValue)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingField(null) }}
                        className="panel-title"
                        style={{ border: 'none', borderBottom: '1px solid var(--accent)', outline: 'none', background: 'transparent', width: '100%', padding: '1px 2px', fontFamily: 'var(--font)' }} />
                    : <div className="panel-title"
                        onClick={() => !panelEditMode && startEdit('name', selectedItem.name)}
                        style={role === 'admin' && !panelEditMode ? { cursor: 'text' } : {}}>
                        {panelEditMode ? panelForm.name || selectedItem.name : selectedItem.name}
                      </div>}
                  {editingField === 'brand' && !panelEditMode
                    ? <input autoFocus type="text" value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        onBlur={() => saveField('brand', editingValue)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingField(null) }}
                        className="panel-sub"
                        style={{ border: 'none', borderBottom: '1px solid var(--accent)', outline: 'none', background: 'transparent', width: '100%', padding: '1px 2px', fontFamily: 'var(--font)', marginTop: 3 }} />
                    : <div className="panel-sub"
                        onClick={() => !panelEditMode && startEdit('brand', selectedItem.brand)}
                        style={role === 'admin' && !panelEditMode ? { cursor: 'text', marginTop: 3 } : { marginTop: 3 }}>
                        {panelEditMode ? panelForm.brand || 'No brand' : (selectedItem.brand || 'No brand')}
                      </div>}
                </div>
                <button className="panel-close" onClick={() => { setSelectedItem(null); setPanelEditMode(false) }}>✕</button>
              </div>

              {panelEditMode ? (
                /* ── Quick edit form ── */
                <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Item name', key: 'name', type: 'text', placeholder: 'Item name' },
                    { label: 'Brand', key: 'brand', type: 'text', placeholder: 'Brand' },
                    { label: 'Serial', key: 'serial', type: 'text', placeholder: 'Serial number' },
                    { label: 'Assigned to', key: 'assigned_to', type: 'text', placeholder: 'Assigned to' },
                    { label: 'Department', key: 'department', type: 'text', placeholder: 'Department' },
                  ].map(({ label, key, type, placeholder }) => (
                    <div key={key}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: 'var(--text-hint)', marginBottom: 4 }}>{label}</div>
                      <input type={type} value={(panelForm as Record<string, string>)[key] ?? ''}
                        onChange={e => setPanelForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        style={{ width: '100%', fontSize: 12, padding: '7px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none' }} />
                    </div>
                  ))}
                  {(['status', 'condition', 'category'] as const).map(key => (
                    <div key={key}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: 'var(--text-hint)', marginBottom: 4 }}>{key.charAt(0).toUpperCase() + key.slice(1)}</div>
                      <select value={(panelForm as Record<string, string>)[key] ?? ''} onChange={e => setPanelForm(f => ({ ...f, [key]: e.target.value }))}
                        style={{ width: '100%', fontSize: 12, height: 34 }}>
                        {key === 'status' && <><option>Available</option><option>In use</option><option>Maintenance</option></>}
                        {key === 'condition' && <><option>Good</option><option>Fair</option><option>Poor</option></>}
                        {key === 'category' && <><option>IT</option><option>Furniture</option><option>Equipment</option><option>Other</option></>}
                      </select>
                    </div>
                  ))}
                  {[{ label: 'Issue date', key: 'date_acquired' }, { label: 'Warranty exp', key: 'warranty_exp' }, { label: 'Last checked', key: 'last_checked' }].map(({ label, key }) => (
                    <div key={key}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: 'var(--text-hint)', marginBottom: 4 }}>{label}</div>
                      <DatePicker value={(panelForm as Record<string, string>)[key] ?? ''} onChange={v => setPanelForm(f => ({ ...f, [key]: v }))} />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: 'var(--text-hint)', marginBottom: 4 }}>Remarks</div>
                    <textarea value={panelForm.remarks ?? ''} onChange={e => setPanelForm(f => ({ ...f, remarks: e.target.value }))}
                      rows={3} style={{ width: '100%', fontSize: 12, padding: '7px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none', resize: 'vertical' }} />
                  </div>
                </div>
              ) : (
                /* ── Read / inline-edit view ── */
                <div className="panel-body">

                  {/* Helper: inline text field */}
                  {(() => {
                    const F = role === 'admin'

                    function FieldText({ field, value, mono }: { field: string; value: string | null; mono?: boolean }) {
                      if (editingField === field) return (
                        <input autoFocus type="text" value={editingValue}
                          onChange={e => setEditingValue(e.target.value)}
                          onBlur={() => saveField(field, editingValue)}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingField(null) }}
                          style={{ fontSize: 12, fontFamily: mono ? 'var(--mono)' : 'var(--font)', border: 'none', borderBottom: '1px solid var(--accent)', outline: 'none', background: 'transparent', color: 'var(--text)', width: '100%', textAlign: 'right', padding: '1px 2px' }} />
                      )
                      return <span className={`detail-val${mono ? ' mono' : ''}`} onClick={() => F && startEdit(field, value)}
                        style={F ? { cursor: 'text', borderBottom: '1px dashed transparent' } : {}}
                        onMouseEnter={e => { if (F) (e.currentTarget as HTMLElement).style.borderBottomColor = 'var(--border-strong)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderBottomColor = 'transparent' }}>
                        {value || '—'}
                      </span>
                    }

                    function FieldSelect({ field, value, options }: { field: string; value: string; options: string[] }) {
                      if (editingField === field) return (
                        <select autoFocus value={editingValue}
                          onChange={e => { setEditingValue(e.target.value); saveField(field, e.target.value) }}
                          onBlur={() => setEditingField(null)}
                          style={{ fontSize: 12, border: 'none', borderBottom: '1px solid var(--accent)', outline: 'none', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                          {options.map(o => <option key={o}>{o}</option>)}
                        </select>
                      )
                      return <span className="detail-val" onClick={() => F && startEdit(field, value)}
                        style={F ? { cursor: 'pointer', borderBottom: '1px dashed transparent' } : {}}
                        onMouseEnter={e => { if (F) (e.currentTarget as HTMLElement).style.borderBottomColor = 'var(--border-strong)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderBottomColor = 'transparent' }}>
                        {field === 'status'
                          ? <span className={`badge ${STATUS_CLASS[value] ?? ''}`}>{value}</span>
                          : field === 'condition'
                          ? <span className={`badge ${COND_CLASS[value] ?? ''}`}>{value}</span>
                          : value || '—'}
                      </span>
                    }

                    function FieldDate({ field, value }: { field: string; value: string | null }) {
                      if (editingField === field) return (
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <DatePicker value={editingValue} onChange={v => { setEditingValue(v); if (v.length === 10) saveField(field, v) }}
                            placeholder="DD-MM-YYYY" />
                        </div>
                      )
                      return <span className="detail-val mono" onClick={() => F && startEdit(field, value)}
                        style={F ? { cursor: 'text', borderBottom: '1px dashed transparent' } : {}}
                        onMouseEnter={e => { if (F) (e.currentTarget as HTMLElement).style.borderBottomColor = 'var(--border-strong)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderBottomColor = 'transparent' }}>
                        {fmtDate(value)}
                      </span>
                    }

                    function FieldTextarea({ field, value }: { field: string; value: string | null }) {
                      if (editingField === field) return (
                        <textarea autoFocus value={editingValue} rows={3}
                          onChange={e => setEditingValue(e.target.value)}
                          onBlur={() => saveField(field, editingValue)}
                          onKeyDown={e => { if (e.key === 'Escape') setEditingField(null) }}
                          style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--accent)', outline: 'none', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', resize: 'vertical', marginTop: 4 }} />
                      )
                      return <p className="panel-remarks" onClick={() => F && startEdit(field, value)}
                        style={F ? { cursor: 'text', borderRadius: 6, padding: '4px 6px', border: '1px dashed transparent', marginLeft: -6 } : {}}
                        onMouseEnter={e => { if (F) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent' }}>
                        {value || '—'}
                      </p>
                    }

                    return <>
                      <div className="panel-section">
                        <div className="panel-section-title">Status &amp; Condition</div>
                        <div className="detail-row"><span className="detail-key">Status</span>
                          <FieldSelect field="status" value={selectedItem.status} options={['Available', 'In use', 'Maintenance']} /></div>
                        <div className="detail-row"><span className="detail-key">Condition</span>
                          <FieldSelect field="condition" value={selectedItem.condition} options={['Good', 'Fair', 'Poor']} /></div>
                        <div className="detail-row"><span className="detail-key">Assigned to</span>
                          <FieldText field="assigned_to" value={selectedItem.assigned_to} /></div>
                        <div className="detail-row"><span className="detail-key">Issue date</span>
                          <FieldDate field="date_acquired" value={selectedItem.date_acquired} /></div>
                      </div>

                      <div className="panel-section">
                        <div className="panel-section-title">Classification</div>
                        <div className="detail-row"><span className="detail-key">Category</span>
                          <FieldSelect field="category" value={selectedItem.category} options={['IT', 'Furniture', 'Equipment', 'Other']} /></div>
                        <div className="detail-row"><span className="detail-key">Department</span>
                          <FieldText field="department" value={selectedItem.department} /></div>
                        <div className="detail-row"><span className="detail-key">Serial No.</span>
                          <FieldText field="serial" value={selectedItem.serial} mono /></div>
                      </div>

                      <div className="panel-section">
                        <div className="panel-section-title">Dates</div>
                        <div className="detail-row"><span className="detail-key">Purchased date</span>
                          <FieldDate field="purchased_date" value={selectedItem.purchased_date} /></div>
                        <div className="detail-row"><span className="detail-key">Warranty exp.</span>
                          <FieldDate field="warranty_exp" value={selectedItem.warranty_exp} /></div>
                        <div className="detail-row"><span className="detail-key">Last checked</span>
                          <FieldDate field="last_checked" value={selectedItem.last_checked} /></div>
                      </div>

                      <div className="panel-section">
                        <div className="panel-section-title">Remarks</div>
                        <FieldTextarea field="remarks" value={selectedItem.remarks} />
                      </div>
                    </>
                  })()}

                  {/* Photos */}
                  <div className="panel-section">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div className="panel-section-title" style={{ marginBottom: 0 }}>Photos</div>
                      {role === 'admin' && (
                        <>
                          <button
                            type="button"
                            onClick={() => photoInputRef.current?.click()}
                            disabled={photoUploading}
                            style={{ fontSize: 11, background: 'none', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'var(--font)' }}>
                            {photoUploading ? 'Uploading…' : '+ Upload'}
                          </button>
                          <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadPhoto} />
                        </>
                      )}
                    </div>
                    {photosLoading ? (
                      <p style={{ fontSize: 11, color: 'var(--text-hint)' }}>Loading…</p>
                    ) : photos.length === 0 ? (
                      <p style={{ fontSize: 11, color: 'var(--text-hint)' }}>No photos yet.</p>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {photos.map(photo => (
                          <div key={photo.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--border)' }}
                            onClick={() => setLightbox(photo.url)}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            {role === 'admin' && (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); deletePhoto(photo) }}
                                style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="panel-section">
                    <div className="panel-section-title">User History</div>
                    {uhLoading ? <p style={{ fontSize: 11, color: 'var(--text-hint)' }}>Loading…</p>
                      : userHistory.length === 0 ? <p style={{ fontSize: 11, color: 'var(--text-hint)' }}>No history yet.</p>
                      : userHistory.map(h => (
                        <div key={h.id} className="detail-row" style={{ alignItems: 'center' }}>
                          <span className="detail-key" style={{ fontWeight: 500, color: 'var(--text)' }}>{h.user_name}</span>
                          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-hint)', textAlign: 'right' }}>
                            {fmtDate(h.date_from)}{h.date_to ? ` → ${fmtDate(h.date_to)}` : ' → present'}
                          </span>
                        </div>
                      ))}
                  </div>

                  <div className="panel-section">
                    <div className="panel-section-title">Maintenance Log</div>
                    {logsLoading ? <p style={{ fontSize: 11, color: 'var(--text-hint)' }}>Loading…</p>
                      : logs.length === 0 ? <p style={{ fontSize: 11, color: 'var(--text-hint)' }}>No entries yet.</p>
                      : <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                          {logs.map((log, i) => (
                            <div key={log.id} style={{ display: 'flex', gap: 10, paddingBottom: 12, position: 'relative' }}>
                              {i < logs.length - 1 && <div style={{ position: 'absolute', left: 5, top: 14, bottom: 0, width: 1, background: 'var(--border)' }} />}
                              <div style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 3, zIndex: 1 }} />
                              <div style={{ flex: 1 }}>
                                <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{log.description}</p>
                                <p style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 3, fontFamily: 'var(--mono)' }}>
                                  {new Date(log.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · {log.logged_by}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>}
                  </div>
                </div>
              )}

              {/* Panel footer */}
              {panelEditMode ? (
                <div className="panel-footer">
                  <button className="btn" onClick={() => setPanelEditMode(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={savePanelEdit} disabled={panelSaving}>
                    {panelSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              ) : role === 'admin' ? (
                <div className="panel-footer">
                  <button className="btn" style={{ color: '#b91c1c', borderColor: 'rgba(185,28,28,0.3)' }} onClick={() => deleteItem(selectedItem)}>Delete</button>
                  <button className="btn" onClick={startPanelEdit}>Quick edit</button>
                  <button className="btn btn-primary" onClick={() => openModal(selectedItem)}>Full edit</button>
                </div>
              ) : null}
            </>
          )}
        </aside>
      </div>

      <footer className="app-footer">
        Inventory Checklist — data stored in Supabase, isolated per account
      </footer>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h2>{editId ? 'Edit item' : 'Add inventory item'}</h2>
              <button className="modal-close" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="form-grid">
              <div className="form-field full">
                <label>Item name *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Dell Latitude 5520" className={nameError ? 'error' : ''} autoFocus />
              </div>
              <div className="form-field"><label>Brand</label>
                <input type="text" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="e.g. Dell" /></div>
              <div className="form-field"><label>Serial number</label>
                <input type="text" value={form.serial} onChange={e => setForm(f => ({ ...f, serial: e.target.value }))} placeholder="e.g. SN-DL5520-001" /></div>
              <div className="form-field"><label>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ItemStatus }))}>
                  <option>Available</option><option>In use</option><option>Maintenance</option></select></div>
              <div className="form-field"><label>Condition</label>
                <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value as Condition }))}>
                  <option>Good</option><option>Fair</option><option>Poor</option></select></div>
              <div className="form-field"><label>Assigned to</label>
                <input type="text" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} placeholder="e.g. John Doe" /></div>
              <div className="form-field"><label>Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))}>
                  <option>IT</option><option>Furniture</option><option>Equipment</option><option>Other</option></select></div>
              <div className="form-field"><label>Department</label>
                <input type="text" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. IT, HR, Finance" /></div>
              <div className="form-field"><label>Issue date</label>
                <DatePicker value={form.date_acquired} onChange={v => setForm(f => ({ ...f, date_acquired: v }))} /></div>
              <div className="form-field"><label>Purchased date</label>
                <DatePicker value={form.purchased_date} onChange={v => setForm(f => ({ ...f, purchased_date: v }))} /></div>
              <div className="form-field"><label>Warranty expiry</label>
                <DatePicker value={form.warranty_exp} onChange={v => setForm(f => ({ ...f, warranty_exp: v }))} /></div>
              <div className="form-field"><label>Last checked</label>
                <DatePicker value={form.last_checked} onChange={v => setForm(f => ({ ...f, last_checked: v }))} /></div>
              <div className="form-field full"><label>Remarks</label>
                <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Any additional details…" /></div>
            </div>

            {editId && (
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
                <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>User History</div>
                  {userHistory.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                      {userHistory.map(h => (
                        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ fontWeight: 500 }}>{h.user_name}</span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-hint)' }}>
                            {fmtDate(h.date_from)}{h.date_to ? ` → ${fmtDate(h.date_to)}` : ' → present'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input type="text" value={uhForm.user_name} onChange={e => setUhForm(f => ({ ...f, user_name: e.target.value }))} placeholder="User name"
                      style={{ fontSize: 13, padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div><div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 4 }}>From</div>
                        <DatePicker value={uhForm.date_from} onChange={v => setUhForm(f => ({ ...f, date_from: v }))} /></div>
                      <div><div style={{ fontSize: 10, color: 'var(--text-hint)', marginBottom: 4 }}>To (optional)</div>
                        <DatePicker value={uhForm.date_to} onChange={v => setUhForm(f => ({ ...f, date_to: v }))} /></div>
                    </div>
                    <button onClick={addUserHistory} disabled={uhSaving || !uhForm.user_name.trim()} className="btn btn-primary" style={{ justifyContent: 'center' }}>
                      {uhSaving ? 'Saving…' : 'Add user entry'}</button>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-hint)', marginBottom: 10 }}>Maintenance Log</div>
                  {logs.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 10 }}>
                      {logs.map((log, i) => (
                        <div key={log.id} style={{ display: 'flex', gap: 10, paddingBottom: 10, position: 'relative' }}>
                          {i < logs.length - 1 && <div style={{ position: 'absolute', left: 5, top: 13, bottom: 0, width: 1, background: 'var(--border)' }} />}
                          <div style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 3, zIndex: 1 }} />
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 12, lineHeight: 1.5 }}>{log.description}</p>
                            <p style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                              {new Date(log.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · {log.logged_by}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" value={logInput} onChange={e => setLogInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLog()}
                      placeholder="Add a log entry…"
                      style={{ flex: 1, fontSize: 13, padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none' }} />
                    <button onClick={addLog} disabled={logSaving || !logInput.trim()} className="btn btn-primary">{logSaving ? '…' : 'Add log'}</button>
                  </div>
                </div>
              </div>
            )}

            <div className="modal-footer">
              <button className="btn" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveItem} disabled={saving}>{saving ? 'Saving…' : 'Save item'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 20, width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      )}

      {/* CSV Import preview modal */}
      {importOpen && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setImportOpen(false) }}>
          <div className="modal" style={{ width: 620, maxWidth: '95vw' }}>
            <div className="modal-header">
              <h2>Import CSV {importRows.length > 0 ? `— ${importRows.length} items found` : ''}</h2>
              <button className="modal-close" onClick={() => setImportOpen(false)}>✕</button>
            </div>
            {importError && <div className="auth-error" style={{ marginBottom: 16 }}>{importError}</div>}
            {importRows.length > 0 ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', maxHeight: 300, overflowY: 'auto', marginBottom: 14 }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', position: 'sticky', top: 0 }}>
                      {['Item Name', 'Brand', 'Status', 'Assigned To', 'Issue Date', 'Category'].map(h => (
                        <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 9, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-hint)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 500 }}>{r.name}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{r.brand || '—'}</td>
                        <td style={{ padding: '6px 10px' }}><span className={`badge ${STATUS_CLASS[r.status ?? 'Available'] ?? ''}`}>{r.status}</span></td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{r.assigned_to || '—'}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{r.date_acquired || '—'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{r.category || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-hint)', fontSize: 13 }}>No valid rows found.</div>
            )}
            <p style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 16, lineHeight: 1.6 }}>
              Expected columns: <span style={{ fontFamily: 'var(--mono)' }}>Item Name, Brand, Serial Number, Status, Condition, Assigned To, Category, Department, Issue Date, Warranty Exp, Last Checked, Remarks</span>
            </p>
            <div className="modal-footer">
              <button className="btn" onClick={() => setImportOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmImport} disabled={importing || importRows.length === 0}>
                {importing ? 'Importing…' : `Import ${importRows.length} item${importRows.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="toast-wrap">
        {toasts.map(t => <div key={t.id} className="toast">{t.msg}</div>)}
      </div>
    </>
  )
}
