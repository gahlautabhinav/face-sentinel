import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import EnrollPage from './components/EnrollPage.jsx'
import IdentifyPage from './components/IdentifyPage.jsx'
import DeletePage from './components/DeletePage.jsx'

export default function App() {
  return (
    <>
      <nav className="nav">
        <NavLink to="/enroll" className={({ isActive }) => isActive ? 'active' : ''}>
          Enroll
        </NavLink>
        <NavLink to="/identify" className={({ isActive }) => isActive ? 'active' : ''}>
          Identify
        </NavLink>
        <NavLink to="/delete" className={({ isActive }) => isActive ? 'active' : ''}>
          Delete
        </NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/enroll" replace />} />
        <Route path="/enroll" element={<EnrollPage />} />
        <Route path="/identify" element={<IdentifyPage />} />
        <Route path="/delete" element={<DeletePage />} />
      </Routes>
    </>
  )
}
