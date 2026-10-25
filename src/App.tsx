import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { supabase } from './lib/supabase'

function SupabaseStatus() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    supabase
      .from('funeral_homes')
      .select('*', { count: 'exact', head: true })
      .then(({ error, count }) => {
        if (error) {
          setStatus('error')
          setDetail(error.message)
        } else {
          setStatus('ok')
          setDetail(`funeral_homes table reachable (${count ?? 0} rows)`)
        }
      })
  }, [])

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>AgenticLantern</h1>
      <p>Supabase connection: {status}</p>
      <p>{detail}</p>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<SupabaseStatus />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
