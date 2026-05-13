# Draft System Extension & Auto-Status Sync

**Date:** 2026-05-13

## Overview

Two related improvements to the inventory panel:

1. **Auto-status sync** — item status automatically transitions to `In use` when a current (open) User History entry is created.
2. **Extended draft system** — UH entries, maintenance logs, and photos are all brought under the panel's Save/X gate, so no sub-section changes persist until the main Save button is clicked (with the exception of photo uploads, which write to storage immediately but still trigger the dirty indicator).

---

## Feature 1 — Auto-Status Sync

### Rule

| Event | Status transition |
|---|---|
| New UH entry added with `date_to = null` | → `In use` |
| End Usage closes the open entry | → `Available` (already implemented) |

### Implementation

In `addUserHistory()`, after inserting the UH row, issue a second `items.update({ status: 'In use' })` for the same item. Update `selectedItem` and `items` state to reflect the new status immediately. No load-time sync — the two UH operations (open/close) fully own the `In use` ↔ `Available` transitions.

---

## Feature 2 — Extended Draft System

### Current state

Item fields already use a `draft` buffer — edits are staged locally and flushed only when Save is clicked. UH entries, maintenance logs, and photos currently bypass this: their internal Save/Delete buttons write to DB immediately.

### Target state

All four sections (item fields, UH, logs, photos) are gated by the single panel Save button. X closes the panel and discards all uncommitted changes across every section.

---

### 2a — User History entries

**Staged ops model:** The `userHistory` state is the source of truth for the displayed list. Each entry gains an optional `_staged` field: `'add' | 'edit' | 'delete'`. DB is never touched until panel Save.

| User action | Local effect |
|---|---|
| Fill add-form → click internal Save | Append entry with temp id (`draft-<uuid>`) and `_staged: 'add'` to `userHistory`. Close add-form. |
| Click an existing entry → edit → internal Save | Update entry in `userHistory` with new values and `_staged: 'edit'`. Close edit-form. |
| Click Delete inside edit-form | Mark entry with `_staged: 'delete'` (keep in list but render greyed/struck). |
| Panel Save | Flush all staged ops to DB in order: deletes first, then edits, then adds. Reload `userHistory` from DB. |
| Panel X | Reload `userHistory` from DB (discards all local mutations). |

**Display:** Staged entries show a subtle `•` or italic style so the user knows they are unsaved. `_staged: 'delete'` entries are shown semi-transparent with strikethrough.

**`isDirty` contribution:** `userHistory.some(h => h._staged)`

---

### 2b — Maintenance Logs

Identical model to UH entries. `logs` state gains `_staged` markers. The same flush-on-Save / reload-on-X pattern applies.

**`isDirty` contribution:** `logs.some(l => l._staged)`

---

### 2c — Photos

Photos are treated differently because uploads write to Supabase Storage immediately (holding a `File` object in memory until Save adds complexity not worth the trade-off).

| User action | Effect |
|---|---|
| Select file → upload | Writes to storage + `item_photos` DB row immediately. Reloads photo grid. Sets `photoUploadedSinceOpen = true`. |
| Click ✕ on a photo | Adds photo ID to `pendingPhotoDeletes` set. Hides photo from grid (optimistic). Does NOT touch storage or DB. |
| Panel Save | Deletes all `pendingPhotoDeletes` from storage + DB. Clears the set. Clears `photoUploadedSinceOpen`. |
| Panel X | Clears `pendingPhotoDeletes` (photos reappear on next load since DB was untouched). Clears `photoUploadedSinceOpen`. |

**`isDirty` contribution:** `pendingPhotoDeletes.size > 0 || photoUploadedSinceOpen`

---

### Combined `isDirty`

```
isDirty =
  Object.keys(draft).length > 0          // item fields
  || userHistory.some(h => h._staged)    // UH entries
  || logs.some(l => l._staged)           // maintenance logs
  || pendingPhotoDeletes.size > 0        // staged photo deletes
  || photoUploadedSinceOpen              // recent upload (cosmetic)
```

---

### State additions

| New state | Type | Purpose |
|---|---|---|
| `pendingPhotoDeletes` | `Set<string>` | Photo IDs staged for deletion |
| `photoUploadedSinceOpen` | `boolean` | Turns Save blue after an upload |

`UserHistory` and `MaintenanceLog` types gain an optional `_staged?: 'add' \| 'edit' \| 'delete'` field (client-only, never sent to DB).

---

### Flush order on Save

1. Delete staged UH entries (`_staged: 'delete'`)
2. Update staged UH entries (`_staged: 'edit'`)
3. Insert staged UH entries (`_staged: 'add'`)
4. Same three steps for logs
5. Delete `pendingPhotoDeletes` from storage + DB
6. Flush item field `draft` to DB (existing logic)
7. Reload all four sections from DB
8. Clear all staged state

Item field flush is last so that a single `updated_at` write closes everything.

---

## Out of scope

- Conflict detection (another user editing the same item simultaneously)
- Undo/redo within the panel
- Drag-to-reorder UH or log entries
