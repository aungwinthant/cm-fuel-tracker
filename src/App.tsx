import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import FuelMap from './components/FuelMap';
import OpsDashboard from './pages/OpsDashboard';
import OpsLogin from './pages/OpsLogin';
import { Analytics } from '@vercel/analytics/react';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('ops_token');
  if (!token) {
    return <Navigate to="/ops/login" replace />;
  }
  return <>{children}</>;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FuelMap />} />
        <Route path="/ops/login" element={<OpsLogin />} />
        <Route 
          path="/ops/dash" 
          element={
            <ProtectedRoute>
              <OpsDashboard />
            </ProtectedRoute>
          } 
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Analytics />
    </BrowserRouter>
  );
}
