'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function InvitePage() {
  const router = useRouter()
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const hash = window.location.hash
    if (hash) {
      const params = new URLSearchParams(hash.substring(1))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      const type = params.get('type')
      if (accessToken && refreshToken && type === 'invite') {
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(() => setReady(true))
      }
    }
  }, [supabase.auth])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  if (!ready) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Setting up your account…
          </p>
        </div>
      </div>
    )
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
        <div className="auth-title">Set your password</div>
        <div className="auth-subtitle">Choose a password to complete your account setup.</div>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-field" style={{ marginBottom: 12 }}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              required
              autoFocus
            />
          </div>
          <div className="form-field" style={{ marginBottom: 20 }}>
            <label>Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
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
            {loading ? 'Saving…' : 'Set password & sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
