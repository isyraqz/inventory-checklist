export type Category = 'IT' | 'Furniture' | 'Equipment' | 'Other'
export type Condition = 'Good' | 'Fair' | 'Poor'
export type ItemStatus = 'Available' | 'In use' | 'Maintenance'

export interface Item {
  id: string
  user_id: string
  name: string
  serial: string
  assigned_to: string
  category: Category
  condition: Condition
  status: ItemStatus
  location: string
  date_acquired: string | null
  notes: string
  checked: boolean
  created_at: string
  updated_at: string
}

export type ItemFormData = {
  name: string
  serial: string
  assigned_to: string
  category: Category
  condition: Condition
  status: ItemStatus
  location: string
  date_acquired: string
  notes: string
  checked: boolean
}
