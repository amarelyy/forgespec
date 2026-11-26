import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router';
import type { User } from '../index';
import { api } from '../ui/api';
import { AuthDialog, AuthMode } from '../ui/AuthDialog';
import { SessionContext } from './context';
import { Dashboard } from './Dashboard';
import { Shell } from './Shell';
import { Soon } from './Soon';
import { Workspace } from './Workspace';
import '@xyflow/react/dist/style.css';
import './workspace.css';

/** Everything behind the login (US-01): without a session the log in dialog is shown instead of the page. */
export default function WorkspaceRoutes() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [mode, setMode] = useState<AuthMode>('login');

  useEffect(() => {
    if (!api.isAuthenticated) return setUser(null);
    api.auth.profile().then(setUser, () => setUser(null));
  }, []);

  if (user === undefined) return <p className="ws-wait">Loading workspace...</p>;
  if (user === null) {
    return (
      <div className="ws-gate">
        <AuthDialog mode={mode} reason="Log in to enter your workspace." api={api} onModeChange={setMode} onClose={() => navigate('/')} onSuccess={setUser} />
      </div>
    );
  }

  const logout = async () => {
    await api.auth.logout().catch(() => undefined);
    navigate('/');
  };

  return (
    <SessionContext.Provider value={{ api, user, logout }}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="library/*" element={<Soon page="library" />} />
          <Route path="rules" element={<Soon page="rules" />} />
          <Route path="settings" element={<Soon page="settings" />} />
          <Route path="projects/:id">
            <Route index element={<Navigate to="bom" replace />} />
            <Route path="bom" element={<Workspace />} />
            <Route path="history" element={<Soon page="history" />} />
            <Route path="compatibility" element={<Soon page="compatibility" />} />
            <Route path="sub-assemblies" element={<Soon page="sub-assemblies" />} />
            <Route path="export" element={<Soon page="export" />} />
            <Route path="library/*" element={<Soon page="library" />} />
            <Route path="rules" element={<Soon page="rules" />} />
            <Route path="settings" element={<Soon page="settings" />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </SessionContext.Provider>
  );
}
