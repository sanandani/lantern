import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { RequireRole } from './components/RequireRole'
import { Home } from './pages/Home'
import { Wizard } from './pages/Wizard'
import { InvitePage } from './pages/InvitePage'
import { FamilyCase } from './pages/FamilyCase'
import { HospitalLogin } from './pages/HospitalLogin'
import { Demo } from './pages/Demo'
import { FuneralHomeLogin } from './pages/FuneralHomeLogin'
import { FuneralHomeDashboard } from './pages/FuneralHomeDashboard'
import { FuneralHomeRequest } from './pages/FuneralHomeRequest'
import { FuneralHomeCase } from './pages/FuneralHomeCase'
import { DemoFuneralHome } from './pages/DemoFuneralHome'

const HospitalDashboard = lazy(() => import('./pages/HospitalDashboard').then((m) => ({ default: m.HospitalDashboard })))
const NewCase = lazy(() => import('./pages/NewCase').then((m) => ({ default: m.NewCase })))
const CaseDetail = lazy(() => import('./pages/CaseDetail').then((m) => ({ default: m.CaseDetail })))

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<p className="center-note">Loading…</p>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/start" element={<Wizard />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/demo/funeral-home" element={<DemoFuneralHome />} />
        <Route path="/funeral-home" element={<FuneralHomeLogin />} />
        <Route path="/funeral-home/login" element={<FuneralHomeLogin />} />
        <Route
          path="/funeral-home/dashboard"
          element={
            <RequireRole role="funeral_home" loginPath="/funeral-home">
              <FuneralHomeDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/funeral-home/requests/:id"
          element={
            <RequireRole role="funeral_home" loginPath="/funeral-home">
              <FuneralHomeRequest />
            </RequireRole>
          }
        />
        <Route
          path="/funeral-home/cases/:caseId"
          element={
            <RequireRole role="funeral_home" loginPath="/funeral-home">
              <FuneralHomeCase />
            </RequireRole>
          }
        />
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
      </Suspense>
    </BrowserRouter>
  )
}

export default App
