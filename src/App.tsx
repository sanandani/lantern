import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { RequireRole } from './components/RequireRole'
import { Home } from './pages/Home'
import { Wizard } from './pages/Wizard'
import { InvitePage } from './pages/InvitePage'
import { FamilyCase } from './pages/FamilyCase'
import { HospitalLogin } from './pages/HospitalLogin'
import { HospitalDashboard } from './pages/HospitalDashboard'
import { NewCase } from './pages/NewCase'
import { CaseDetail } from './pages/CaseDetail'
import { Demo } from './pages/Demo'
import { FuneralHomeWip } from './pages/FuneralHomeWip'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/start" element={<Wizard />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/funeral-home" element={<FuneralHomeWip />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route
          path="/case"
          element={
            <RequireRole role="family">
              <FamilyCase />
            </RequireRole>
          }
        />

        <Route path="/hospital/login" element={<HospitalLogin />} />
        <Route
          path="/hospital/dashboard"
          element={
            <RequireRole role="hospital">
              <HospitalDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/hospital/cases/new"
          element={
            <RequireRole role="hospital">
              <NewCase />
            </RequireRole>
          }
        />
        <Route
          path="/hospital/cases/:id"
          element={
            <RequireRole role="hospital">
              <CaseDetail />
            </RequireRole>
          }
        />

        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
