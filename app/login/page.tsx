'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 1.5A1.5 1.5 0 0 1 5.5 0h4.086a1.5 1.5 0 0 1 1.06.44l2.915 2.914A1.5 1.5 0 0 1 14 4.414V13.5A1.5 1.5 0 0 1 12.5 15h-7A1.5 1.5 0 0 1 4 13.5v-12Z" fill="var(--surface2)" stroke="var(--border-strong)" strokeWidth="1"/>
            <path d="M9.5 0v3.5A1.5 1.5 0 0 0 11 5h3" stroke="var(--border-strong)" strokeWidth="1" fill="none"/>
            <path d="M6 8h4M6 10.5h3" stroke="var(--text-hint)" strokeWidth="1" strokeLinecap="round"/>
          </svg>
          Verus Virtus — Inventory Checklist
        </div>
        <div className="auth-title">Sign in</div>
        <div className="auth-subtitle">Enter your credentials to continue.</div>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-field" style={{ marginBottom: 12 }}>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>
          <div className="form-field" style={{ marginBottom: 20 }}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
