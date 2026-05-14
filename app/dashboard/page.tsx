'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Item, ItemFormData, Category, Condition, ItemStatus, MaintenanceLog, UserHistory, ItemPhoto } from '@/lib/types'
import DatePicker from '@/components/DatePicker'
import ChartPanel from '@/components/ChartPanel'

const EMPTY_FORM: ItemFormData = {
  name: '', brand: '', serial: '', status: 'In use', condition: 'Good',
  assigned_to: '', category: 'IT', department: '', date_acquired: '',
  purchased_date: '', warranty_exp: '', last_checked: '', remarks: '', checked: false,
}

const STATUS_CLASS: Record<string, string> = {
  Available: 'b-available', 'In use': 'b-inuse', Maintenance: 'b-maintenance', Retired: 'b-retired',
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
  { key: 'date_acquired', label: 'Assigned Date' },
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

function todayDMY(): string {
  const t = new Date()
  const d = String(t.getDate()).padStart(2, '0')
  const m = String(t.getMonth() + 1).padStart(2, '0')
  return `${d}-${m}-${t.getFullYear()}`
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
      date_acquired: get(v, ['assigned date', 'assigned date', 'date acquired', 'date_acquired']),
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
  const [showRetired, setShowRetired] = useState(false)
  const [auditChecked, setAuditChecked] = useState<Set<string>>(new Set())
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [showCharts, setShowCharts] = useState(false)
  const [logs, setLogs] = useState<MaintenanceLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logInput, setLogInput] = useState('')
  const [logAddOpen, setLogAddOpen] = useState(false)
  const [logAddDate, setLogAddDate] = useState('')
  const [editingLog, setEditingLog] = useState<string | null>(null)
  const [logEditValue, setLogEditValue] = useState('')
  const [logEditDate, setLogEditDate] = useState('')
  const [userHistory, setUserHistory] = useState<UserHistory[]>([])
  const [uhLoading, setUhLoading] = useState(false)
  const [uhForm, setUhForm] = useState({ user_name: '', date_from: '', date_to: '' })
  const [uhAddOpen, setUhAddOpen] = useState(false)
  const [editingUh, setEditingUh] = useState<string | null>(null)
  const [uhEditForm, setUhEditForm] = useState({ user_name: '', date_from: '', date_to: '' })

  // ── Panel draft state ──
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [pendingPhotoDeletes, setPendingPhotoDeletes] = useState<Set<string>>(new Set())
  const [photoUploadedSinceOpen, setPhotoUploadedSinceOpen] = useState(false)
  const [panelSaving, setPanelSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<Partial<ItemFormData>[]>([])
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const [currentPage, setCurrentPage] = useState(1)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [photos, setPhotos] = useState<ItemPhoto[]>([])
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null)
  const [photoDraftDate, setPhotoDraftDate] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)

  const toastId = useRef(0)
  const importInputRef = useRef<HTMLInputElement>(null)
  const snap = useRef({ selectedItem: null as Item | null, role: 'viewer' as 'admin' | 'viewer', modalOpen: false, importOpen: false, filtered: [] as Item[] })
  const assignedToWasBlank = useRef(false)
  const pendingNewUserName = useRef('')

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

  function sortPhotos(a: ItemPhoto, b: ItemPhoto) {
    const da = a.photo_date ?? a.uploaded_at.slice(0, 10)
    const db = b.photo_date ?? b.uploaded_at.slice(0, 10)
    return db.localeCompare(da)
  }

  const loadPhotos = useCallback(async (itemId: string) => {
    setPhotosLoading(true)
    const { data } = await supabase.from('item_photos').select('*').eq('item_id', itemId)
    const sorted = ((data as ItemPhoto[]) || []).sort((a, b) => {
      const da = a.photo_date ?? a.uploaded_at.slice(0, 10)
      const db = b.photo_date ?? b.uploaded_at.slice(0, 10)
      return db.localeCompare(da)
    })
    setPhotos(sorted)
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
    setDraft({}); setEditingField(null)
    setPendingPhotoDeletes(new Set()); setPhotoUploadedSinceOpen(false)
    pendingNewUserName.current = ''; assignedToWasBlank.current = false
    setUhAddOpen(false); setEditingUh(null)
    setLogAddOpen(false); setEditingLog(null); setLogInput(''); setLogAddDate('')
    if (selectedItem) {
      setUhForm({ user_name: '', date_from: '', date_to: '' })
      loadLogs(selectedItem.id); loadUserHistory(selectedItem.id); loadPhotos(selectedItem.id)
    } else {
      setLogs([]); setUserHistory([]); setPhotos([])
    }
  }, [selectedItem, loadLogs, loadUserHistory, loadPhotos])

  // Reset to page 1 when search or filters change
  useEffect(() => { setCurrentPage(1) }, [search, filterCat, filterStatus, sortKey, sortDir, showRetired])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const { selectedItem, role, modalOpen, importOpen, filtered } = snap.current
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (modalOpen || importOpen) return

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
        setSelectedItem(null)
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

    // Auto-defaults: assigned_to → "Office", date_acquired → today
    const assignedTo = form.assigned_to.trim() || 'Office'
    const assignedDateDB = toDBDate(form.date_acquired) || new Date().toISOString().slice(0, 10)

    const payload = {
      name: form.name, brand: form.brand, serial: form.serial, status: form.status,
      condition: form.condition, assigned_to: assignedTo, category: form.category,
      department: form.department, date_acquired: assignedDateDB,
      purchased_date: toDBDate(form.purchased_date) || null,
      warranty_exp: toDBDate(form.warranty_exp) || null,
      last_checked: toDBDate(form.last_checked) || null, remarks: form.remarks,
    }

    if (editId) {
      const original = items.find(i => i.id === editId)
      const { error } = await supabase.from('items').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editId)
      if (!error) {
        const wasBlank = !original?.assigned_to
        const assignedToChanged = original?.assigned_to !== assignedTo
        const dateChanged = original?.date_acquired !== assignedDateDB

        if (wasBlank && assignedTo) {
          // Re-assigning after End Usage — create a new open UH entry
          await supabase.from('item_user_history').insert({
            item_id: editId, user_name: assignedTo, date_from: assignedDateDB, date_to: null,
          })
        } else if (!wasBlank && (assignedToChanged || dateChanged)) {
          // Name correction or date correction — update the open UH entry
          const { data: openEntry } = await supabase.from('item_user_history')
            .select('id').eq('item_id', editId).is('date_to', null)
            .order('date_from', { ascending: false }).limit(1)
          if (openEntry && openEntry.length > 0) {
            const updates: Record<string, string> = {}
            if (assignedToChanged) updates.user_name = assignedTo
            if (dateChanged) updates.date_from = assignedDateDB
            await supabase.from('item_user_history').update(updates).eq('id', openEntry[0].id)
          }
        }

        toast('Item updated')
        await loadItems()
        setSelectedItem(prev => prev?.id === editId ? { ...prev, ...payload } as Item : prev)
        if (selectedItem?.id === editId) await loadUserHistory(editId)
      }
    } else {
      // New item — insert and auto-create first UH entry
      const { data: inserted, error } = await supabase
        .from('items').insert({ ...payload, user_id: user.id }).select().single()
      if (!error && inserted) {
        await supabase.from('item_user_history').insert({
          item_id: inserted.id, user_name: assignedTo, date_from: assignedDateDB, date_to: null,
        })
        toast('Item added')
        await loadItems()
      }
    }
    setSaving(false); setModalOpen(false)
  }

  async function endUsage(itemId?: string) {
    const id = itemId ?? editId
    if (!id) return
    const todayDB = new Date().toISOString().slice(0, 10)

    // Use already-loaded userHistory state to find the open entry (avoids a re-query)
    // Falls back to a DB query if called outside panel context
    let openId: string | null = null
    let openUser: string = ''
    let openFrom: string | null = null

    const stateEntry = userHistory.find(h => !h.date_to)
    if (stateEntry) {
      openId = stateEntry.id
      openUser = stateEntry.user_name
      openFrom = stateEntry.date_from
    } else {
      const { data } = await supabase
        .from('item_user_history').select('*').eq('item_id', id).is('date_to', null)
        .order('date_from', { ascending: false }).limit(1)
      if (data && data.length > 0) {
        openId = data[0].id; openUser = data[0].user_name; openFrom = data[0].date_from
      }
    }

    // Close the open UH entry: DELETE + re-INSERT with date_to=today
    // (avoids RLS UPDATE restrictions that silently block writes)
    if (openId) {
      const { error: delErr } = await supabase.from('item_user_history').delete().eq('id', openId)
      if (delErr) { toast('Error closing history: ' + delErr.message); return }
      const { error: insErr } = await supabase.from('item_user_history').insert({
        item_id: id, user_name: openUser, date_from: openFrom, date_to: todayDB,
      })
      if (insErr) { toast('Error saving history: ' + insErr.message); return }
    }

    // Clear assigned_to and date_acquired, set status to Available
    const { error: itemErr } = await supabase.from('items').update({
      assigned_to: '', date_acquired: null, status: 'Available',
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (itemErr) { toast('Error updating item: ' + itemErr.message); return }

    setForm(f => ({ ...f, assigned_to: '', date_acquired: '' }))
    await loadItems()
    setSelectedItem(prev => prev?.id === id ? { ...prev, assigned_to: '', date_acquired: null, status: 'Available' } as Item : prev)
    await loadUserHistory(id)
    toast('Usage ended')
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

  // ── History / Log — all mutations staged locally, flushed on panel Save ──
  function addUserHistory() {
    if (!uhForm.user_name.trim() || !selectedItem) return
    const isOpen = !uhForm.date_to
    const entry: UserHistory = {
      id: `draft-${Date.now()}`,
      item_id: selectedItem.id,
      user_name: uhForm.user_name.trim(),
      date_from: toDBDate(uhForm.date_from) || null,
      date_to: toDBDate(uhForm.date_to) || null,
      created_at: new Date().toISOString(),
      _staged: 'add',
    }
    setUserHistory(prev => [entry, ...prev])
    // Auto-set status to In use when adding an open (current) entry
    if (isOpen) setDraft(d => ({ ...d, status: 'In use' }))
    setUhForm({ user_name: '', date_from: '', date_to: '' })
    setUhAddOpen(false)
  }
  function saveUhEntry(id: string) {
    if (!uhEditForm.user_name.trim()) return
    setUserHistory(prev => prev.map(h => h.id === id ? {
      ...h,
      user_name: uhEditForm.user_name.trim(),
      date_from: toDBDate(uhEditForm.date_from) || null,
      date_to: toDBDate(uhEditForm.date_to) || null,
      _staged: h._staged === 'add' ? 'add' : 'edit',
    } : h))
    setEditingUh(null)
  }
  function deleteUhEntry(id: string) {
    setUserHistory(prev => {
      const entry = prev.find(h => h.id === id)
      // Staged-add entries were never in DB — just remove from local list
      if (entry?._staged === 'add') return prev.filter(h => h.id !== id)
      return prev.map(h => h.id === id ? { ...h, _staged: 'delete' as const } : h)
    })
    setEditingUh(null)
  }
  function addLog() {
    if (!logInput.trim() || !selectedItem || !userId) return
    const entry: MaintenanceLog = {
      id: `draft-${Date.now()}`,
      item_id: selectedItem.id,
      user_id: userId,
      logged_by: userEmail,
      description: logInput.trim(),
      log_date: toDBDate(logAddDate) || null,
      created_at: new Date().toISOString(),
      _staged: 'add',
    }
    setLogs(prev => [entry, ...prev])
    setLogInput(''); setLogAddDate(''); setLogAddOpen(false)
  }
  function saveLogEntry(id: string) {
    if (!logEditValue.trim()) return
    setLogs(prev => prev.map(l => l.id === id ? {
      ...l,
      description: logEditValue.trim(),
      log_date: toDBDate(logEditDate) || null,
      _staged: l._staged === 'add' ? 'add' : 'edit',
    } : l))
    setEditingLog(null)
  }
  function deleteLogEntry(id: string) {
    setLogs(prev => {
      const entry = prev.find(l => l.id === id)
      if (entry?._staged === 'add') return prev.filter(l => l.id !== id)
      return prev.map(l => l.id === id ? { ...l, _staged: 'delete' as const } : l)
    })
    setEditingLog(null)
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
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('item_photos').insert({ item_id: selectedItem.id, user_id: user.id, storage_path: path, url: publicUrl, photo_date: today })
    await loadPhotos(selectedItem.id)
    setPhotoUploading(false)
    setPhotoUploadedSinceOpen(true)
    toast('Photo uploaded')
  }
  function deletePhoto(photo: ItemPhoto) {
    // Stage deletion — actual storage/DB removal happens on panel Save
    setPendingPhotoDeletes(prev => new Set([...prev, photo.id]))
  }

  async function savePhotoDate(photoId: string, newDate: string) {
    await supabase.from('item_photos').update({ photo_date: newDate || null }).eq('id', photoId)
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, photo_date: newDate || null } : p).sort(sortPhotos))
    setEditingPhotoId(null)
  }

  const DATE_FIELDS = new Set(['date_acquired', 'purchased_date', 'warranty_exp', 'last_checked'])

  // Stage a field edit into draft (replaces immediate DB save)
  function commitToDraft(field: string, value: string) {
    setDraft(d => ({ ...d, [field]: value }))
    setEditingField(null)
  }

  function startEdit(field: string, current: string | null) {
    if (role !== 'admin') return
    if (field === 'assigned_to') {
      const effective = draft.assigned_to ?? selectedItem?.assigned_to ?? ''
      assignedToWasBlank.current = !effective.trim()
    }
    setEditingField(field)
    // Prefer already-staged draft value, fall back to item value
    const staged = draft[field]
    setEditingValue(staged !== undefined ? staged : DATE_FIELDS.has(field) ? toFormDate(current) : (current ?? ''))
  }

  async function saveDraft() {
    if (!selectedItem || !isDirty) return
    const name = draft.name ?? selectedItem.name
    if (!name.trim()) { toast('Item name is required'); return }
    // Compulsory date when user is assigned
    const effectiveAssigned = draft.assigned_to ?? selectedItem.assigned_to
    const effectiveDate = 'date_acquired' in draft ? draft.date_acquired : toFormDate(selectedItem.date_acquired)
    if (effectiveAssigned && !effectiveDate) { toast('Assigned Date is required when assigning a user'); return }
    setPanelSaving(true)

    // 1. Flush staged UH ops (deletes → edits → adds)
    for (const h of userHistory.filter(h => h._staged === 'delete' && !h.id.startsWith('draft-'))) {
      await supabase.from('item_user_history').delete().eq('id', h.id)
    }
    for (const h of userHistory.filter(h => h._staged === 'edit')) {
      // RLS blocks UPDATE on item_user_history — use DELETE + INSERT instead
      await supabase.from('item_user_history').delete().eq('id', h.id)
      await supabase.from('item_user_history').insert({
        item_id: selectedItem.id, user_name: h.user_name, date_from: h.date_from, date_to: h.date_to,
      })
    }
    for (const h of userHistory.filter(h => h._staged === 'add')) {
      await supabase.from('item_user_history').insert({
        item_id: selectedItem.id, user_name: h.user_name, date_from: h.date_from, date_to: h.date_to,
      })
    }

    // 2. Flush staged log ops (deletes → edits → adds)
    for (const l of logs.filter(l => l._staged === 'delete' && !l.id.startsWith('draft-'))) {
      await supabase.from('maintenance_logs').delete().eq('id', l.id)
    }
    for (const l of logs.filter(l => l._staged === 'edit')) {
      await supabase.from('maintenance_logs').update({
        description: l.description, log_date: l.log_date,
      }).eq('id', l.id)
    }
    for (const l of logs.filter(l => l._staged === 'add')) {
      await supabase.from('maintenance_logs').insert({
        item_id: selectedItem.id, user_id: userId!, logged_by: userEmail,
        description: l.description, log_date: l.log_date,
      })
    }

    // 3. Flush staged photo deletions
    for (const photoId of pendingPhotoDeletes) {
      const photo = photos.find(p => p.id === photoId)
      if (photo) {
        await supabase.storage.from('item-photos').remove([photo.storage_path])
        await supabase.from('item_photos').delete().eq('id', photoId)
      }
    }

    // 4. Flush item field draft
    const payload: Record<string, unknown> = {
      name,
      brand: draft.brand ?? selectedItem.brand ?? '',
      serial: draft.serial ?? selectedItem.serial,
      status: draft.status ?? selectedItem.status,
      condition: draft.condition ?? selectedItem.condition,
      assigned_to: draft.assigned_to ?? selectedItem.assigned_to,
      category: draft.category ?? selectedItem.category,
      department: draft.department ?? selectedItem.department ?? '',
      date_acquired: 'date_acquired' in draft ? (toDBDate(draft.date_acquired) || null) : selectedItem.date_acquired,
      purchased_date: 'purchased_date' in draft ? (toDBDate(draft.purchased_date) || null) : selectedItem.purchased_date,
      warranty_exp: 'warranty_exp' in draft ? (toDBDate(draft.warranty_exp) || null) : selectedItem.warranty_exp,
      last_checked: 'last_checked' in draft ? (toDBDate(draft.last_checked) || null) : selectedItem.last_checked,
      remarks: draft.remarks ?? selectedItem.remarks ?? '',
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('items').update(payload).eq('id', selectedItem.id)
    if (error) { toast('Error: ' + error.message); setPanelSaving(false); return }

    // 5. Reload and clear all staged state
    const updated = { ...selectedItem, ...payload } as Item
    setSelectedItem(updated)
    setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, ...payload } : i))
    setDraft({})
    setPendingPhotoDeletes(new Set())
    setPhotoUploadedSinceOpen(false)
    await Promise.all([
      loadUserHistory(selectedItem.id),
      loadLogs(selectedItem.id),
      loadPhotos(selectedItem.id),
    ])
    toast('Saved')
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
    const headers = ['No', 'Item Name', 'Brand', 'Serial Number', 'Status', 'Condition', 'Assigned To', 'Category', 'Department', 'Assigned Date', 'Warranty Exp', 'Last Checked', 'Remarks']
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
      (showRetired || i.status !== 'Retired') &&
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
  snap.current = { selectedItem, role, modalOpen, importOpen, filtered }

  // Reset to page 1 whenever the visible list changes
  const PAGE_SIZE = 10
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const paginatedItems = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const isDirty =
    Object.keys(draft).length > 0 ||
    userHistory.some(h => h._staged) ||
    logs.some(l => l._staged) ||
    pendingPhotoDeletes.size > 0 ||
    photoUploadedSinceOpen

  const retiredCount = items.filter(i => i.status === 'Retired').length
  const total = items.filter(i => i.status !== 'Retired').length
  const checkedCount = auditChecked.size
  const avail = items.filter(i => i.status === 'Available').length
  const maint = items.filter(i => i.status === 'Maintenance').length
  const pct = total ? Math.round(checkedCount / total * 100) : 0
  const colSpanFull = COL_LABELS.length + 1 + (role === 'admin' ? 1 : 0)

  const isAdmin = role === 'admin'

  return (
    <>
      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" className="logo-svg">
            <path d="M4 1.5A1.5 1.5 0 0 1 5.5 0h4.086a1.5 1.5 0 0 1 1.06.44l2.915 2.914A1.5 1.5 0 0 1 14 4.414V13.5A1.5 1.5 0 0 1 12.5 15h-7A1.5 1.5 0 0 1 4 13.5v-12Z"
              fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.4)" strokeWidth="1"/>
            <path d="M9.5 0v3.5A1.5 1.5 0 0 0 11 5h3" stroke="rgba(255,255,255,0.4)" strokeWidth="1" fill="none"/>
            <path d="M6 8h4M6 10.5h3" stroke="rgba(255,255,255,0.6)" strokeWidth="1" strokeLinecap="round"/>
          </svg>
          <span className="logo-text">Verus Virtus — Inventory Checklist</span>
        </div>
        <div className="header-right">
          {userEmail && (
            <span className="user-email">{userEmail}</span>
          )}
          {isAdmin && <span className="admin-chip">admin</span>}
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle dark mode">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <div className="dashboard-layout">
        <main className="app-body">
          {/* Stats */}
          <div className="stats-row">
            <div className="stat-card stat-card-total">
              <div className="stat-label">Total Items</div>
              <div className="stat-value">{total}</div>
            </div>
            {role === 'admin' && (
              <div className={`stat-card stat-card-inuse${auditChecked.size > 0 ? ' stat-card-active' : ''}`}>
                <div className="stat-label">Checked In</div>
                <div className="stat-value">{checkedCount}</div>
                <div className="stat-sub">{pct}% verified</div>
              </div>
            )}
            <div className="stat-card stat-card-avail">
              <div className="stat-label">Available</div>
              <div className="stat-value">{avail}</div>
            </div>
            <div className="stat-card stat-card-maint">
              <div className="stat-label">Maintenance</div>
              <div className="stat-value">{maint}</div>
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
                <button type="button" onClick={() => setSearch('')} title="Clear" className="search-clear">✕</button>
              )}
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option>Available</option><option>In use</option><option>Maintenance</option><option>Retired</option>
            </select>
            {retiredCount > 0 && (
              <button className={`btn ${showRetired ? 'btn-active' : 'btn-inactive-retired'}`} onClick={() => setShowRetired(s => !s)}>
                {showRetired ? 'Hide retired' : 'Show retired'}
                <span>{retiredCount}</span>
              </button>
            )}
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">All categories</option>
              <option>IT</option><option>Furniture</option><option>Equipment</option><option>Other</option>
            </select>
            <button className={`btn ${showCharts ? 'btn-active' : 'btn-charts-inactive'}`} onClick={() => setShowCharts(s => !s)}>
              <svg viewBox="0 0 16 16" fill="currentColor" className="btn-icon">
                <path d="M1 11a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-3Zm5-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Zm5-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V3Z"/>
              </svg>
              Charts
            </button>
            <button className="btn" onClick={exportCSV}>
              <svg viewBox="0 0 16 16" fill="currentColor" className="btn-icon">
                <path d="M8 1.25a.75.75 0 0 1 .75.75v6.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L7.25 8.19V2A.75.75 0 0 1 8 1.25ZM2 13.25a.75.75 0 0 0 0 1.5h12a.75.75 0 0 0 0-1.5H2Z" />
              </svg>
              Export
            </button>
            {role === 'admin' && (
              <>
                <button className="btn" onClick={() => importInputRef.current?.click()}
                  title="Import items from CSV">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="btn-icon">
                    <path d="M8 1.25a.75.75 0 0 1 .75.75v6.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L7.25 8.19V2A.75.75 0 0 1 8 1.25ZM2 13.25a.75.75 0 0 0 0 1.5h12a.75.75 0 0 0 0-1.5H2Z"
                      transform="rotate(180 8 8)" />
                  </svg>
                  Import
                </button>
                <input ref={importInputRef} type="file" accept=".csv,.txt" onChange={handleCSVFile} className="hidden-input" />
              </>
            )}
          </div>

          {showCharts && <ChartPanel items={items} />}

          {/* Unified selection bar — appears from 1+ items checked, bulk actions appear at 2+ */}
          {auditChecked.size > 0 && (
            <div className="bulk-bar">
              <div className="bulk-bar-left">
                <input type="checkbox"
                  checked={auditChecked.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll} />
                <span className="bulk-count">{auditChecked.size} item{auditChecked.size !== 1 ? 's' : ''} selected</span>
              </div>
              <div className="bulk-bar-right">
                {auditChecked.size > 1 && (
                  <select defaultValue="" onChange={e => { if (e.target.value) { bulkSetStatus(e.target.value as ItemStatus); e.currentTarget.value = '' } }}
                    className="bulk-status-select">
                    <option value="" disabled>Set status…</option>
                    <option>Available</option><option>In use</option><option>Maintenance</option><option>Retired</option>
                  </select>
                )}
                <button className="btn bulk-select-btn" onClick={clearAudit}>Clear Selection</button>
                <button className="btn bulk-delete-btn" onClick={bulkDelete}>Delete {auditChecked.size}</button>
              </div>
            </div>
          )}

          {/* Add button row */}
          <div className="add-btn-row">
            {role === 'admin' && (
              <button className="btn btn-primary ml-auto" onClick={() => openModal()}>
                <svg viewBox="0 0 16 16" fill="currentColor" className="btn-icon">
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
              <colgroup>
                {role === 'admin' && <col style={{ width: '36px' }} />}
                <col style={{ width: '52px' }} />
                <col style={{ width: '300px' }} />
                <col style={{ width: '180px' }} />
                <col style={{ width: '180px' }} />
                <col style={{ width: '180px' }} />
                <col style={{ width: '180px' }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  {role === 'admin' && (
                    <th className="th-no" />
                  )}
                  <th className="th-number">No</th>
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
                ) : paginatedItems.map((item, idx) => {
                  const globalIdx = pageStart + idx
                  return (
                  <tr key={item.id}
                    onClick={() => { setSelectedItem(prev => prev?.id === item.id ? null : item); setFocusedIdx(globalIdx) }}
                    className={[
                      role === 'admin' && auditChecked.has(item.id) ? 'row-checked' : '',
                      selectedItem?.id === item.id ? 'row-selected' : '',
                      item.status === 'Retired' ? 'row-retired' : '',
                    ].filter(Boolean).join(' ')}>
                    {role === 'admin' && (
                      <td className="no-strike" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={auditChecked.has(item.id)} onChange={() => toggleItem(item.id)} />
                      </td>
                    )}
                    <td className="col-no">{String(globalIdx + 1).padStart(3, '0')}</td>
                    <td className="item-name">{item.name}</td>
                    <td>{item.brand || <span className="text-hint">—</span>}</td>
                    <td>{item.assigned_to || <span className="text-hint">—</span>}</td>
                    <td><span className={`badge ${STATUS_CLASS[item.status] ?? ''}`}>{item.status}</span></td>
                    <td className="col-date col-date-cell mono">{fmtDate(item.date_acquired)}</td>
                    <td className="col-remarks col-remarks-cell">
                      {item.remarks || <span className="text-hint">—</span>}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
            </div>{/* end table-scroll */}

          {/* Pagination — Option C */}
          {filtered.length > 0 && (
            <div className="pagination">
              <span className="pg-info">
                Showing <strong>{pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)}</strong> of <strong>{filtered.length}</strong> item{filtered.length !== 1 ? 's' : ''}
              </span>
              <div className="pg-controls">
                <button
                  className="pg-btn"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}>
                  ← Prev
                </button>
                <span className="pg-page-label">Page <strong>{safePage}</strong> of {totalPages}</span>
                <button
                  className="pg-btn"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}>
                  Next →
                </button>
              </div>
            </div>
          )}
          </div>

          {/* Keyboard shortcut hint */}
          <div className="shortcut-bar">
            {[['↑↓', 'Navigate']].map(([k, l]) => (
              <span key={k} className="shortcut-item">
                <span className="shortcut-key">{k}</span>
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
                <div className="panel-title-wrap">
                  {editingField === 'name'
                    ? <input autoFocus type="text" value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        onBlur={() => commitToDraft('name', editingValue)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingField(null) }}
                        className="panel-title panel-inline-input" />
                    : <div className={`panel-title${role === 'admin' ? ' cursor-text' : ''}`}
                        onClick={() => startEdit('name', selectedItem.name)}>
                        {draft.name ?? selectedItem.name}
                      </div>}
                  {editingField === 'brand'
                    ? <input autoFocus type="text" value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        onBlur={() => commitToDraft('brand', editingValue)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingField(null) }}
                        className="panel-sub panel-inline-input mt-3" />
                    : <div className={`panel-sub mt-3${role === 'admin' ? ' cursor-text' : ''}`}
                        onClick={() => startEdit('brand', selectedItem.brand)}>
                        {(draft.brand ?? selectedItem.brand) || 'No brand'}
                      </div>}
                </div>
                <button className="panel-close" onClick={() => setSelectedItem(null)}>✕</button>
              </div>

              {/* ── Inline-edit view ── */}
              <div className="panel-body">

                  <div className="panel-section">
                    <div className="panel-section-title">Status &amp; Condition</div>

                    {/* Status */}
                    <div className="detail-row"><span className="detail-key">Status</span>
                      {editingField === 'status'
                        ? <select autoFocus value={editingValue} onChange={e => { setEditingValue(e.target.value); commitToDraft('status', e.target.value) }} onBlur={() => setEditingField(null)}
                            className="panel-inline-select">
                            {['Available','In use','Maintenance','Retired'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        : <span className={`detail-val${role === 'admin' ? ' cursor-pointer' : ''}`} onClick={() => role === 'admin' && startEdit('status', selectedItem.status)}>
                            {(() => { const s = draft.status ?? selectedItem.status; return <span className={`badge ${STATUS_CLASS[s] ?? ''}`}>{s}</span> })()}
                          </span>}
                    </div>

                    {/* Condition */}
                    <div className="detail-row"><span className="detail-key">Condition</span>
                      {editingField === 'condition'
                        ? <select autoFocus value={editingValue} onChange={e => { setEditingValue(e.target.value); commitToDraft('condition', e.target.value) }} onBlur={() => setEditingField(null)}
                            className="panel-inline-select">
                            {['Good','Fair','Poor'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        : <span className={`detail-val${role === 'admin' ? ' cursor-pointer' : ''}`} onClick={() => role === 'admin' && startEdit('condition', selectedItem.condition)}>
                            {(() => { const c = draft.condition ?? selectedItem.condition; return <span className={`badge ${COND_CLASS[c] ?? ''}`}>{c}</span> })()}
                          </span>}
                    </div>

                    {/* Assigned to */}
                    <div className="detail-row"><span className="detail-key">Assigned to</span>
                      {editingField === 'assigned_to'
                        ? <input autoFocus type="text" value={editingValue} onChange={e => setEditingValue(e.target.value)}
                            onBlur={() => {
                              const newVal = editingValue.trim()
                              if (assignedToWasBlank.current && newVal) {
                                // New assignment: stage name + status, record pending, open date picker
                                setDraft(d => ({ ...d, assigned_to: editingValue, status: 'In use' }))
                                setEditingField(null)
                                pendingNewUserName.current = newVal
                                setTimeout(() => startEdit('date_acquired', selectedItem.date_acquired), 0)
                              } else if (!assignedToWasBlank.current && newVal) {
                                // Existing user renamed: commit and sync open UH entry
                                commitToDraft('assigned_to', editingValue)
                                const openEntry = userHistory.find(h => !h.date_to && h._staged !== 'delete')
                                if (openEntry) {
                                  setUserHistory(prev => prev.map(h => h.id === openEntry.id
                                    ? { ...h, user_name: newVal, _staged: h._staged === 'add' ? 'add' : 'edit' as const }
                                    : h))
                                }
                              } else {
                                commitToDraft('assigned_to', editingValue)
                              }
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingField(null) }}
                            className="panel-inline-input-r" />
                        : (() => {
                            const effectiveAssigned = draft.assigned_to ?? selectedItem.assigned_to
                            return effectiveAssigned
                              ? <span className={`detail-val${role === 'admin' ? ' cursor-text' : ''}`} onClick={() => role === 'admin' && startEdit('assigned_to', selectedItem.assigned_to)}>{effectiveAssigned}</span>
                              : role === 'admin'
                                ? <span onClick={() => startEdit('assigned_to', '')} className="add-user-link">＋ Add new user</span>
                                : <span className="detail-val">—</span>
                          })()}
                    </div>

                    {/* Assigned date */}
                    <div className="detail-row"><span className="detail-key">Assigned date</span>
                      {editingField === 'date_acquired'
                        ? <div className="date-picker-wrap">
                            <DatePicker value={editingValue} maxDate={todayDMY()} onChange={v => {
                              setEditingValue(v)
                              if (v.length !== 10) return
                              commitToDraft('date_acquired', v)
                              const dateDB = toDBDate(v)
                              if (pendingNewUserName.current) {
                                // New user: create staged UH entry
                                const newEntry: UserHistory = {
                                  id: `draft-${Date.now()}`,
                                  item_id: selectedItem.id,
                                  user_name: pendingNewUserName.current,
                                  date_from: dateDB,
                                  date_to: null,
                                  created_at: new Date().toISOString(),
                                  _staged: 'add',
                                }
                                setUserHistory(prev => [newEntry, ...prev])
                                pendingNewUserName.current = ''
                              } else {
                                // Existing user: sync date_from of open UH entry
                                const effectiveAssigned = draft.assigned_to ?? selectedItem.assigned_to
                                if (effectiveAssigned) {
                                  const openEntry = userHistory.find(h => !h.date_to && h._staged !== 'delete')
                                  if (openEntry) {
                                    setUserHistory(prev => prev.map(h => h.id === openEntry.id
                                      ? { ...h, date_from: dateDB, _staged: h._staged === 'add' ? 'add' : 'edit' as const }
                                      : h))
                                  }
                                }
                              }
                            }} placeholder="DD-MM-YYYY" />
                          </div>
                        : <span className={`detail-val mono${role === 'admin' ? ' cursor-text' : ''}`} onClick={() => role === 'admin' && startEdit('date_acquired', selectedItem.date_acquired)}>
                            {'date_acquired' in draft ? (draft.date_acquired || '—') : fmtDate(selectedItem.date_acquired)}
                          </span>}
                    </div>

                    {/* End Usage */}
                    {role === 'admin' && (
                      <div className="end-usage-wrap">
                        <button type="button" onClick={() => endUsage(selectedItem.id)} className="btn-danger">
                          <svg viewBox="0 0 16 16" fill="currentColor" className="btn-danger-icon">
                            <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 1.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM5.5 7.25h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1 0-1.5Z"/>
                          </svg>
                          End Usage
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="panel-section">
                    <div className="panel-section-title">Classification</div>

                    {/* Category */}
                    <div className="detail-row"><span className="detail-key">Category</span>
                      {editingField === 'category'
                        ? <select autoFocus value={editingValue} onChange={e => { setEditingValue(e.target.value); commitToDraft('category', e.target.value) }} onBlur={() => setEditingField(null)}
                            className="panel-inline-select">
                            {['IT','Furniture','Equipment','Other'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        : <span className={`detail-val${role === 'admin' ? ' cursor-pointer' : ''}`} onClick={() => role === 'admin' && startEdit('category', selectedItem.category)}>
                            {draft.category ?? selectedItem.category}
                          </span>}
                    </div>

                    {/* Department */}
                    <div className="detail-row"><span className="detail-key">Department</span>
                      {editingField === 'department'
                        ? <input autoFocus type="text" value={editingValue} onChange={e => setEditingValue(e.target.value)}
                            onBlur={() => commitToDraft('department', editingValue)}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingField(null) }}
                            className="panel-inline-input-r" />
                        : <span className={`detail-val${role === 'admin' ? ' cursor-text' : ''}`} onClick={() => role === 'admin' && startEdit('department', selectedItem.department)}>
                            {(draft.department ?? selectedItem.department) || '—'}
                          </span>}
                    </div>

                    {/* Serial */}
                    <div className="detail-row"><span className="detail-key">Serial No.</span>
                      {editingField === 'serial'
                        ? <input autoFocus type="text" value={editingValue} onChange={e => setEditingValue(e.target.value)}
                            onBlur={() => commitToDraft('serial', editingValue)}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingField(null) }}
                            className="panel-inline-input-mono" />
                        : <span className={`detail-val mono${role === 'admin' ? ' cursor-text' : ''}`} onClick={() => role === 'admin' && startEdit('serial', selectedItem.serial)}>
                            {(draft.serial ?? selectedItem.serial) || '—'}
                          </span>}
                    </div>
                  </div>

                  <div className="panel-section">
                    <div className="panel-section-title">Dates</div>

                    {/* Purchased date */}
                    <div className="detail-row"><span className="detail-key">Purchased date</span>
                      {editingField === 'purchased_date'
                        ? <div className="date-picker-wrap">
                            <DatePicker value={editingValue} maxDate={todayDMY()} onChange={v => { setEditingValue(v); if (v.length === 10) commitToDraft('purchased_date', v) }} placeholder="DD-MM-YYYY" />
                          </div>
                        : <span className={`detail-val mono${role === 'admin' ? ' cursor-text' : ''}`} onClick={() => role === 'admin' && startEdit('purchased_date', selectedItem.purchased_date)}>
                            {'purchased_date' in draft ? (draft.purchased_date || '—') : fmtDate(selectedItem.purchased_date)}
                          </span>}
                    </div>

                    {/* Warranty exp */}
                    <div className="detail-row"><span className="detail-key">Warranty exp.</span>
                      {editingField === 'warranty_exp'
                        ? <div className="date-picker-wrap">
                            <DatePicker value={editingValue} onChange={v => { setEditingValue(v); if (v.length === 10) commitToDraft('warranty_exp', v) }} placeholder="DD-MM-YYYY" />
                          </div>
                        : <span className={`detail-val mono${role === 'admin' ? ' cursor-text' : ''}`} onClick={() => role === 'admin' && startEdit('warranty_exp', selectedItem.warranty_exp)}>
                            {'warranty_exp' in draft ? (draft.warranty_exp || '—') : fmtDate(selectedItem.warranty_exp)}
                          </span>}
                    </div>

                    {/* Last checked */}
                    <div className="detail-row"><span className="detail-key">Last checked</span>
                      {editingField === 'last_checked'
                        ? <div className="date-picker-wrap">
                            <DatePicker value={editingValue} maxDate={todayDMY()} onChange={v => { setEditingValue(v); if (v.length === 10) commitToDraft('last_checked', v) }} placeholder="DD-MM-YYYY" />
                          </div>
                        : <span className={`detail-val mono${role === 'admin' ? ' cursor-text' : ''}`} onClick={() => role === 'admin' && startEdit('last_checked', selectedItem.last_checked)}>
                            {'last_checked' in draft ? (draft.last_checked || '—') : fmtDate(selectedItem.last_checked)}
                          </span>}
                    </div>
                  </div>

                  <div className="panel-section">
                    <div className="panel-section-title">Remarks</div>
                    {editingField === 'remarks'
                      ? <textarea autoFocus value={editingValue} rows={3}
                          onChange={e => setEditingValue(e.target.value)}
                          onBlur={() => commitToDraft('remarks', editingValue)}
                          onKeyDown={e => { if (e.key === 'Escape') setEditingField(null) }}
                          className="remarks-textarea" />
                      : <p className={`panel-remarks${role === 'admin' ? ' remarks-view-admin' : ''}`} onClick={() => role === 'admin' && startEdit('remarks', selectedItem.remarks)}>
                          {(draft.remarks ?? selectedItem.remarks) || '—'}
                        </p>}
                  </div>

                  {/* Photos */}
                  <div className="panel-section">
                    <div className="section-header">
                      <div className="panel-section-title section-title-nowrap">Photos</div>
                      {role === 'admin' && (
                        <>
                          <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading} className="btn-sm">
                            {photoUploading ? 'Uploading…' : '+ Upload'}
                          </button>
                          <input ref={photoInputRef} type="file" accept="image/*" className="hidden-input" onChange={uploadPhoto} />
                        </>
                      )}
                    </div>
                    {photosLoading ? (
                      <p className="photos-loading">Loading…</p>
                    ) : photos.filter(p => !pendingPhotoDeletes.has(p.id)).length === 0 ? (
                      <p className="photos-loading">No photos yet.</p>
                    ) : (
                      <div className="photos-grid">
                        {photos.filter(p => !pendingPhotoDeletes.has(p.id)).map(photo => {
                          const displayDate = photo.photo_date ?? photo.uploaded_at.slice(0, 10)
                          return (
                          <div key={photo.id} className="photo-card">
                            <div className="photo-thumb" onClick={() => setLightbox(photo.url)}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={photo.url} alt="" className="photo-img" />
                              {role === 'admin' && (
                                <button type="button" onClick={e => { e.stopPropagation(); deletePhoto(photo) }} className="photo-del">✕</button>
                              )}
                            </div>
                            <div className="photo-meta" onClick={e => e.stopPropagation()}>
                              {editingPhotoId === photo.id ? (
                                <DatePicker
                                  autoOpen
                                  value={photoDraftDate}
                                  onChange={val => {
                                    // DatePicker gives DD-MM-YYYY, convert to YYYY-MM-DD for DB
                                    const dbDate = val.split('-').reverse().join('-')
                                    savePhotoDate(photo.id, dbDate)
                                  }}
                                  onClose={() => setEditingPhotoId(null)}
                                />
                              ) : (
                                <span
                                  className={`photo-date-label${role === 'admin' ? ' editable' : ''}`}
                                  onClick={role === 'admin' ? () => {
                                    // Convert YYYY-MM-DD → DD-MM-YYYY for DatePicker
                                    setEditingPhotoId(photo.id)
                                    setPhotoDraftDate(displayDate.split('-').reverse().join('-'))
                                  } : undefined}
                                >
                                  {fmtDate(displayDate)}
                                </span>
                              )}
                            </div>
                          </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="panel-section">
                    <div className="section-header">
                      <div className="panel-section-title section-title-nowrap">User History</div>
                      {role === 'admin' && !uhAddOpen && (
                        <button type="button" onClick={() => { setUhAddOpen(true); setEditingUh(null) }} className="btn-sm">
                          + Add
                        </button>
                      )}
                    </div>

                    {/* Add form */}
                    {uhAddOpen && role === 'admin' && (
                      <div className="panel-form-box">
                        <input type="text" value={uhForm.user_name} placeholder="User name"
                          onChange={e => setUhForm(f => ({ ...f, user_name: e.target.value }))}
                          className="panel-form-input" />
                        <div className="panel-form-fields">
                          <div>
                            <div className="panel-form-label">From</div>
                            <DatePicker value={uhForm.date_from} maxDate={todayDMY()}
                              onChange={v => setUhForm(f => {
                                const clearTo = f.date_to && toDBDate(v) > toDBDate(f.date_to)
                                return { ...f, date_from: v, date_to: clearTo ? '' : f.date_to }
                              })} placeholder="DD-MM-YYYY" />
                          </div>
                          <div>
                            <div className="panel-form-label">To</div>
                            <DatePicker value={uhForm.date_to} minDate={uhForm.date_from || undefined}
                              maxDate={userHistory.find(h => !h.date_to) ? toFormDate(userHistory.find(h => !h.date_to)!.date_from) : todayDMY()}
                              onChange={v => setUhForm(f => ({ ...f, date_to: v }))} placeholder="DD-MM-YYYY" />
                          </div>
                        </div>
                        <div className="panel-form-actions">
                          <button onClick={() => { setUhAddOpen(false); setUhForm({ user_name: '', date_from: '', date_to: '' }) }}
                            className="btn panel-form-btn">Cancel</button>
                          <button onClick={addUserHistory} disabled={!uhForm.user_name.trim() || !uhForm.date_from || !uhForm.date_to}
                            className="btn btn-primary panel-form-btn">Add</button>
                        </div>
                      </div>
                    )}

                    {uhLoading ? <p className="photos-loading">Loading…</p>
                      : userHistory.filter(h => h._staged !== 'delete').length === 0 ? <p className="photos-loading">No history yet.</p>
                      : userHistory.filter(h => h._staged !== 'delete').map((h, idx, visible) => {
                        const isOpen = !h.date_to
                        const newerEntry = idx > 0 ? visible[idx - 1] : null
                        const overlapMax = newerEntry ? toFormDate(newerEntry.date_from) : todayDMY()
                        const isEditable = !isOpen && role === 'admin'
                        return (
                          <div key={h.id}>
                            {editingUh === h.id && !isOpen ? (
                              /* Edit form — past entries only */
                              <div className="panel-form-box">
                                <input type="text" value={uhEditForm.user_name} placeholder="User name"
                                  onChange={e => setUhEditForm(f => ({ ...f, user_name: e.target.value }))}
                                  className="panel-form-input" />
                                <div className="panel-form-fields">
                                  <div>
                                    <div className="panel-form-label">From</div>
                                    <DatePicker value={uhEditForm.date_from} maxDate={todayDMY()}
                                      onChange={v => setUhEditForm(f => {
                                        const clearTo = f.date_to && toDBDate(v) > toDBDate(f.date_to)
                                        return { ...f, date_from: v, date_to: clearTo ? '' : f.date_to }
                                      })} placeholder="DD-MM-YYYY" />
                                  </div>
                                  <div>
                                    <div className="panel-form-label">To</div>
                                    <DatePicker value={uhEditForm.date_to} minDate={uhEditForm.date_from || undefined} maxDate={overlapMax}
                                      onChange={v => setUhEditForm(f => ({ ...f, date_to: v }))} placeholder="DD-MM-YYYY" />
                                  </div>
                                </div>
                                <div className="panel-form-actions">
                                  <button onClick={() => deleteUhEntry(h.id)}
                                    className="btn btn-danger-sm">Delete</button>
                                  <button onClick={() => setEditingUh(null)}
                                    className="btn panel-form-btn">Cancel</button>
                                  <button onClick={() => saveUhEntry(h.id)} disabled={!uhEditForm.user_name.trim()}
                                    className="btn btn-primary panel-form-btn">Save</button>
                                </div>
                              </div>
                            ) : (
                              /* Display row */
                              <div className={`detail-row uh-entry${isEditable ? ' uh-entry-admin' : ''}${h._staged ? ' uh-entry-staged' : ''}`}
                                onClick={() => {
                                  if (isEditable) {
                                    setEditingUh(h.id); setUhAddOpen(false)
                                    setUhEditForm({ user_name: h.user_name, date_from: toFormDate(h.date_from), date_to: toFormDate(h.date_to) })
                                  }
                                }}
                                onMouseEnter={e => { if (isEditable) (e.currentTarget as HTMLElement).style.background = 'var(--surface2)' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}>
                                <span className="detail-key uh-user">
                                  {h.user_name}
                                  {isOpen && <span className="badge-current">current</span>}
                                  {h._staged && <span className="badge-unsaved">unsaved</span>}
                                </span>
                                <span className="uh-dates">
                                  {fmtDate(h.date_from)}{h.date_to ? ` → ${fmtDate(h.date_to)}` : ' → present'}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                  </div>

                  <div className="panel-section">
                    <div className="section-header">
                      <div className="panel-section-title section-title-nowrap">Maintenance Log</div>
                      {role === 'admin' && !logAddOpen && (
                        <button type="button" onClick={() => { setLogAddOpen(true); setEditingLog(null) }} className="btn-sm">
                          + Add
                        </button>
                      )}
                    </div>

                    {/* Add form */}
                    {logAddOpen && role === 'admin' && (
                      <div className="panel-form-box">
                        <textarea value={logInput} rows={3} placeholder="Describe the maintenance…"
                          onChange={e => setLogInput(e.target.value)}
                          className="log-form-textarea" />
                        <div>
                          <div className="panel-form-label">Date</div>
                          <DatePicker value={logAddDate} onChange={setLogAddDate} placeholder="DD-MM-YYYY" />
                        </div>
                        <div className="panel-form-actions">
                          <button onClick={() => { setLogAddOpen(false); setLogInput(''); setLogAddDate('') }}
                            className="btn panel-form-btn">Cancel</button>
                          <button onClick={addLog} disabled={!logInput.trim() || !userId}
                            className="btn btn-primary panel-form-btn">Add</button>
                        </div>
                      </div>
                    )}

                    {logsLoading ? <p className="photos-loading">Loading…</p>
                      : logs.filter(l => l._staged !== 'delete').length === 0 ? <p className="photos-loading">No entries yet.</p>
                      : <div className="ml-list">
                          {logs.filter(l => l._staged !== 'delete').slice().sort((a, b) => {
                            const da = a.log_date || a.created_at || ''
                            const db = b.log_date || b.created_at || ''
                            return db.localeCompare(da)
                          }).map((log, i, visible) => (
                            <div key={log.id}>
                              {editingLog === log.id ? (
                                <div className="panel-form-box">
                                  <textarea value={logEditValue} rows={3}
                                    onChange={e => setLogEditValue(e.target.value)}
                                    className="log-form-textarea" />
                                  <div>
                                    <div className="panel-form-label">Date</div>
                                    <DatePicker value={logEditDate} onChange={setLogEditDate} placeholder="DD-MM-YYYY" />
                                  </div>
                                  <p className="log-meta">logged by {log.logged_by}</p>
                                  <div className="panel-form-actions">
                                    <button onClick={() => deleteLogEntry(log.id)}
                                      className="btn btn-danger-sm">Delete</button>
                                    <button onClick={() => setEditingLog(null)}
                                      className="btn panel-form-btn">Cancel</button>
                                    <button onClick={() => saveLogEntry(log.id)} disabled={!logEditValue.trim()}
                                      className="btn btn-primary panel-form-btn">Save</button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className={`ml-entry-wrap${role === 'admin' ? ' cursor-pointer' : ''}${log._staged ? ' ml-entry-staged' : ''}`}
                                  onClick={() => { if (role === 'admin') { setEditingLog(log.id); setLogAddOpen(false); setLogEditValue(log.description); setLogEditDate(toFormDate(log.log_date)) } }}
                                  onMouseEnter={e => { if (role === 'admin') (e.currentTarget as HTMLElement).style.background = 'var(--surface2)' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}>
                                  {i < visible.length - 1 && <div className="uh-connector" />}
                                  <div className={`uh-dot${log._staged ? ' uh-dot-staged' : ''}`} />
                                  <div className="ml-content">
                                    <p className="ml-desc">{log.description}</p>
                                    <p className="ml-meta">
                                      {log.log_date ? fmtDate(log.log_date) : new Date(log.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · {log.logged_by}
                                      {log._staged && <span className="badge-unsaved">unsaved</span>}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>}
                  </div>
                </div>

              {/* Panel footer */}
              {role === 'admin' && (
                <div className="panel-footer">
                  <button className="btn panel-delete-btn" onClick={() => deleteItem(selectedItem)}>Delete</button>
                  <button
                    className={`btn${isDirty ? ' btn-primary' : ' panel-save-btn-disabled'}`}
                    onClick={saveDraft}
                    disabled={!isDirty || panelSaving}>
                    {panelSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
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
                  <option>Available</option><option>In use</option><option>Maintenance</option><option>Retired</option></select></div>
              <div className="form-field"><label>Condition</label>
                <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value as Condition }))}>
                  <option>Good</option><option>Fair</option><option>Poor</option></select></div>
              <div className="form-field"><label>Assigned to</label>
                <input type="text" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} placeholder="e.g. John Doe (defaults to Office)" /></div>
              <div className="form-field"><label>Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))}>
                  <option>IT</option><option>Furniture</option><option>Equipment</option><option>Other</option></select></div>
              <div className="form-field"><label>Department</label>
                <input type="text" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. IT, HR, Finance" /></div>
              <div className="form-field"><label>Assigned date</label>
                <DatePicker value={form.date_acquired} maxDate={todayDMY()} onChange={v => setForm(f => ({ ...f, date_acquired: v }))} />
              </div>
              {editId && (
                <div className="form-field full">
                  <button type="button" onClick={() => endUsage()} className="btn-danger">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="btn-danger-icon">
                      <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 1.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM5.5 7.25h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1 0-1.5Z"/>
                    </svg>
                    End Usage
                  </button>
                  <p className="photos-loading">Closes current assignment and clears assigned fields.</p>
                </div>
              )}
              <div className="form-field"><label>Purchased date</label>
                <DatePicker value={form.purchased_date} maxDate={todayDMY()} onChange={v => setForm(f => ({ ...f, purchased_date: v }))} /></div>
              <div className="form-field"><label>Warranty expiry</label>
                <DatePicker value={form.warranty_exp} onChange={v => setForm(f => ({ ...f, warranty_exp: v }))} /></div>
              <div className="form-field"><label>Last checked</label>
                <DatePicker value={form.last_checked} maxDate={todayDMY()} onChange={v => setForm(f => ({ ...f, last_checked: v }))} /></div>
              <div className="form-field full"><label>Remarks</label>
                <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Any additional details…" /></div>
            </div>

            {editId && (
              <div className="modal-section-extra">
                <hr className="modal-hr" />
                <div>
                  <div className="modal-subsection-label">User History</div>
                  {userHistory.length === 0
                    ? <p className="photos-loading">No history yet — will be created on save.</p>
                    : <div className="uh-modal-list">
                        {userHistory.map(h => {
                          const isOpen = !h.date_to
                          return (
                            <div key={h.id} className="uh-modal-entry">
                              <span className="uh-modal-name">
                                {h.user_name}
                                {isOpen && <span className="badge-current">current</span>}
                              </span>
                              <span className="uh-modal-dates">
                                {fmtDate(h.date_from)}{h.date_to ? ` → ${fmtDate(h.date_to)}` : ' → present'}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                  }
                  <p className="panel-remarks-note">Manage via Assigned To / Assigned Date above, or the detail panel.</p>
                </div>
                <div>
                  <div className="modal-subsection-label">Maintenance Log</div>
                  {logs.length > 0 && (
                    <div className="modal-log-list">
                      {logs.map((log, i) => (
                        <div key={log.id} className="modal-log-entry">
                          {i < logs.length - 1 && <div className="modal-log-connector" />}
                          <div className="modal-log-dot" />
                          <div className="modal-log-content">
                            <p className="modal-log-desc">{log.description}</p>
                            <p className="modal-log-meta">
                              {new Date(log.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · {log.logged_by}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="modal-add-log-row">
                    <input type="text" value={logInput} onChange={e => setLogInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLog()}
                      placeholder="Add a log entry…"
                      className="modal-log-input" />
                    <button onClick={addLog} disabled={!logInput.trim()} className="btn btn-primary">Add log</button>
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
        <div onClick={() => setLightbox(null)} className="lightbox-overlay">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="lightbox-img" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="lightbox-close">✕</button>
        </div>
      )}

      {/* CSV Import preview modal */}
      {importOpen && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setImportOpen(false) }}>
          <div className="modal import-modal">
            <div className="modal-header">
              <h2>Import CSV {importRows.length > 0 ? `— ${importRows.length} items found` : ''}</h2>
              <button className="modal-close" onClick={() => setImportOpen(false)}>✕</button>
            </div>
            {importError && <div className="auth-error">{importError}</div>}
            {importRows.length > 0 ? (
              <div className="import-table-wrap">
                <table className="import-table">
                  <thead className="import-thead">
                    <tr>
                      {['Item Name', 'Brand', 'Status', 'Assigned To', 'Assigned Date', 'Category'].map(h => (
                        <th key={h} className="import-th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((r, i) => (
                      <tr key={i} className="import-tr">
                        <td className="import-td">{r.name}</td>
                        <td className="import-td-brand">{r.brand || '—'}</td>
                        <td className="import-td"><span className={`badge ${STATUS_CLASS[r.status ?? 'Available'] ?? ''}`}>{r.status}</span></td>
                        <td className="import-td-brand">{r.assigned_to || '—'}</td>
                        <td className="import-td-mono">{r.date_acquired || '—'}</td>
                        <td className="import-td-brand">{r.category || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="import-empty">No valid rows found.</div>
            )}
            <p className="import-hint">
              Expected columns: <span className="import-mono-span">Item Name, Brand, Serial Number, Status, Condition, Assigned To, Category, Department, Assigned Date, Warranty Exp, Last Checked, Remarks</span>
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
