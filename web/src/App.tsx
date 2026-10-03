import { NavLink, Route, Routes } from 'react-router'
import { useAdminToken } from './auth/adminToken'
import OverviewPage from './pages/OverviewPage'
import RestaurantsPage from './pages/RestaurantsPage'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
  }`

function AdminStatus() {
  const { hasToken, forgetToken } = useAdminToken()
  if (!hasToken) return null
  return (
    <div className="ml-auto flex items-center gap-2 text-sm text-slate-600">
      <span>Admin unlocked</span>
      <button type="button" onClick={forgetToken} className="text-slate-900 underline hover:no-underline">
        Forget token
      </button>
    </div>
  )
}

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <span className="text-lg font-semibold">ListingWatch</span>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navClass}>
              Overview
            </NavLink>
            <NavLink to="/restaurants" className={navClass}>
              Restaurants
            </NavLink>
          </nav>
          <AdminStatus />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/restaurants" element={<RestaurantsPage />} />
          <Route path="*" element={<p className="text-slate-600">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  )
}
