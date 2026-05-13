export type Category = 'IT' | 'Furniture' | 'Equipment' | 'Other'

export interface MaintenanceLog {
  id: string
  item_id: string
  user_id: string
  logged_by: string
  description: string
  log_date: string | null
  created_at: string
  _staged?: 'add' | 'edit' | 'delete'
}
export type Condition = 'Good' | 'Fair' | 'Poor'
export type ItemStatus = 'Available' | 'In use' | 'Maintenance' | 'Retired'

export interface Item {
  id: string
  user_id: string
  item_no: number
  name: string
  brand: string
  serial: string
  status: ItemStatus
  condition: Condition
  assigned_to: string
  category: Category
  department: string
  date_acquired: string | null
  purchased_date: string | null
  warranty_exp: string | null
  last_checked: string | null
  remarks: string
  location: string
  notes: string
  checked: boolean
  created_at: string
  updated_at: string
}

export type ItemFormData = {
  name: string
  brand: string
  serial: string
  status: ItemStatus
  condition: Condition
  assigned_to: string
  category: Category
  department: string
  date_acquired: string
  purchased_date: string
  warranty_exp: string
  last_checked: string
  remarks: string
  checked: boolean
}

export interface ItemPhoto {
  id: string
  item_id: string
  user_id: string
  storage_path: string
  url: string
  uploaded_at: string
}

export interface UserHistory {
  id: string
  item_id: string
  user_name: string
  date_from: string | null
  date_to: string | null
  created_at: string
  _staged?: 'add' | 'edit' | 'delete'
}
