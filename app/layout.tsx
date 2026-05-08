import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Inventory Checklist',
  description: 'Multi-user inventory management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
