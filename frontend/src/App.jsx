import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import EnrollPage from './components/EnrollPage.jsx'
import KioskPage from './components/KioskPage.jsx'
import RegisterPage from './components/RegisterPage.jsx'
import AdminPage from './components/AdminPage.jsx'

const ScanIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <path d="M2 7V4a1 1 0 0 1 1-1h3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
    <path d="M13 3h3a1 1 0 0 1 1 1v3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
    <path d="M18 13v3a1 1 0 0 1-1 1h-3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
    <path d="M7 17H4a1 1 0 0 1-1-1v-3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
    <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
)

export default function App() {
  const location = useLocation()
  const isRegister = location.pathname === '/register'

  if (isRegister) {
    return (
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
      </Routes>
    )
  }

  return (
    <>
      <nav className="nav">
        <div className="nav-brand">
          <div className="brand-scan-icon">
            <ScanIcon />
          </div>
          <span className="nav-brand-text">LogBook<em>360</em></span>
        </div>

        <NavLink to="/enroll"    className={({ isActive }) => isActive ? 'active' : ''}>Enroll</NavLink>
        <NavLink to="/kiosk"     className={({ isActive }) => isActive ? 'active' : ''}>Kiosk</NavLink>
        <NavLink to="/admin"     className={({ isActive }) => isActive ? 'active' : ''}>Admin</NavLink>

        <div className="nav-status">
          <div className="nav-status-dot" />
          <span className="nav-status-label">Online</span>
        </div>
      </nav>

      <Routes>
        <Route path="/"         element={<Navigate to="/enroll" replace />} />
        <Route path="/enroll"   element={<EnrollPage />} />
        <Route path="/kiosk"    element={<KioskPage />} />
        <Route path="/admin"    element={<AdminPage />} />
      </Routes>
    </>
  )
}
