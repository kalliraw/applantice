import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext.tsx'
import { RequireAuth } from './auth/RequireAuth.tsx'
import { LernendenProvider } from './lib/LernendenContext.tsx'
import { Layout } from './components/Layout.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { DashboardPage } from './pages/DashboardPage.tsx'
import { HandlungskompetenzenPage } from './pages/HandlungskompetenzenPage.tsx'
import { SelbsteinschaetzungPage } from './pages/SelbsteinschaetzungPage.tsx'
import { FaecherPage } from './pages/FaecherPage.tsx'
import { NotenPage } from './pages/NotenPage.tsx'
import { BildungsberichtPage } from './pages/BildungsberichtPage.tsx'
import { TeamRotationPage } from './pages/TeamRotationPage.tsx'
import { EinstellungenPage } from './pages/EinstellungenPage.tsx'

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <LernendenProvider>
                  <Layout />
                </LernendenProvider>
              </RequireAuth>
            }
          >
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/handlungskompetenzen" element={<HandlungskompetenzenPage />} />
            <Route path="/selbsteinschaetzung" element={<SelbsteinschaetzungPage />} />
            <Route path="/noten" element={<NotenPage />} />
            <Route path="/bildungsbericht" element={<BildungsberichtPage />} />
            <Route path="/faecher" element={<FaecherPage />} />
            <Route path="/teams" element={<TeamRotationPage />} />
            <Route path="/einstellungen" element={<EinstellungenPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
