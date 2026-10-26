import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAdmin, RequireAuth } from './auth/AuthContext'
import { AppShell } from './components/AppShell'
import Achievements from './pages/Achievements'
import AdminMembers from './pages/AdminMembers'
import Daily from './pages/Daily'
import Home from './pages/Home'
import Leaderboard from './pages/Leaderboard'
import Login from './pages/Login'
import MyWork from './pages/MyWork'
import Profile from './pages/Profile'
import ProjectDetail from './pages/ProjectDetail'
import Projects from './pages/Projects'
import Team from './pages/Team'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="daily" element={<Daily />} />
        <Route path="my-work" element={<MyWork />} />
        <Route path="team" element={<Team />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="achievements" element={<Achievements />} />
        <Route path="profile" element={<Profile />} />
        <Route
          path="admin/members"
          element={
            <RequireAdmin>
              <AdminMembers />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
