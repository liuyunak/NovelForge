import { Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import AuthGuard from './components/AuthGuard'
import Login from './pages/Login'
import SetupWizard from './pages/SetupWizard'
import Bookshelf from './pages/Bookshelf'
import WorkspaceLayout from './pages/WorkspaceLayout'

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Public: first-run setup wizard */}
        <Route path="/setup" element={<SetupWizard />} />

        {/* Public: login / register */}
        <Route path="/login" element={<Login />} />

        {/* Protected: all workspace routes require authentication */}
        <Route element={<AuthGuard />}>
          <Route path="/" element={<Bookshelf />} />
          <Route path="/workspace/:id/*" element={<WorkspaceLayout />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  )
}

export default App
