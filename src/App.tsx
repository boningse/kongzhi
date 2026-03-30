import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import DeviceConfig from "./pages/DeviceConfig";
import RealtimeData from "./pages/RealtimeData";
import ProjectManagement from "./pages/ProjectManagement";
import ApiConfig from "./pages/ApiConfig";
import SystemManagement from "./pages/SystemManagement";
import WebSocketConfig from "./pages/WebSocketConfig";
import DataDistribution from "./pages/DataDistribution";
import DeviceTypeConfig from "./pages/DeviceTypeConfig";
import Login from "./pages/Login";

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token');
  return token ? <>{children}</> : <Navigate to="/login" />;
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Routes */}
        <Route
          path="*"
          element={
            <PrivateRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/devices" element={<DeviceConfig />} />
                  <Route path="/projects" element={<ProjectManagement />} />
                  <Route path="/realtime" element={<RealtimeData />} />
                  <Route path="/api-config" element={<ApiConfig />} />
                  <Route path="/data-distribution" element={<DataDistribution />} />
                  <Route path="/device-types" element={<DeviceTypeConfig />} />
                  <Route path="/ws-config" element={<WebSocketConfig />} />
                  <Route path="/system" element={<SystemManagement />} />
                </Routes>
              </Layout>
            </PrivateRoute>
          }
        />
      </Routes>
    </Router>
  );
}
