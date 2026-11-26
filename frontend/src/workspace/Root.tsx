import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router';
import { App } from '../ui/App';

// The workspace (and its canvas library) is only downloaded when someone opens it.
const WorkspaceRoutes = lazy(() => import('./WorkspaceRoutes'));

function Landing() {
  const navigate = useNavigate();
  return <App onEnterWorkspace={() => navigate('/dashboard')} />;
}

export function Root() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/*"
          element={
            <Suspense fallback={<p style={{ padding: 24 }}>Loading workspace...</p>}>
              <WorkspaceRoutes />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
