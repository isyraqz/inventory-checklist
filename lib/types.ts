export type Category = 'IT' | 'Furniture' | 'Equipment' | 'Other'

export interface MaintenanceLog {
  id: string
  item_id: string
  user_id: string
  logged_by: string
  description: string
  created_at: string
}
export type Condition = 'Good' | 'Fair' | 'Poor'
export type ItemStatus = 'Available' | 'In use' | 'Maintenance'

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
  warranty_exp: string
  last_checked: string
  remarks: string
  checked: boolean
}
