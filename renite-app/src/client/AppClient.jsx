import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ClientLayout from './layouts/ClientLayout';
import LanguageProvider from './context/LanguageContext';

// Home is eager — it is the first screen every user lands on after login,
// so there is no benefit to deferring it.
import Home from './views/Home';

// Every other route is lazy-loaded. Vite emits a separate JS chunk for each,
// so the initial download contains only the app shell + Home page code.
const Login              = lazy(() => import('./views/Login'));
const AssetTracker       = lazy(() => import('./views/AssetTracker'));
const MapView            = lazy(() => import('./views/MapView'));
const Chat               = lazy(() => import('./views/Chat'));
const Profile            = lazy(() => import('./views/Profile'));
const EmergencyReport    = lazy(() => import('./views/EmergencyReport'));
const Volunteers         = lazy(() => import('./views/Volunteers'));
const MissingPersonDetail = lazy(() => import('./views/MissingPersonDetail'));
const MissingPersonList  = lazy(() => import('./views/MissingPersonList'));
const EmergencyDesk      = lazy(() => import('./views/EmergencyDesk'));
const Rewards            = lazy(() => import('./views/Rewards'));
const TrackStatus        = lazy(() => import('./views/TrackStatus'));

// Minimal inline fallback — no external dependency, no extra chunk.
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
    </div>
  );
}

export default function AppClient() {
  return (
    <LanguageProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ClientLayout />}>
            <Route index element={<Navigate to="/home" />} />
            <Route path="home"             element={<Home />} />
            <Route path="assets"           element={<AssetTracker />} />
            <Route path="map"              element={<MapView />} />
            <Route path="chat"             element={<Chat />} />
            <Route path="rewards"          element={<Rewards />} />
            <Route path="profile"          element={<Profile />} />
            <Route path="emergency-report" element={<EmergencyReport />} />
            <Route path="volunteers"       element={<Volunteers />} />
            <Route path="track"            element={<TrackStatus />} />
            <Route path="missing-person"   element={<Navigate to="/missing" replace />} />
            <Route path="missing"          element={<MissingPersonList />} />
            <Route path="missing/:id"      element={<MissingPersonDetail />} />
            <Route path="report"           element={<EmergencyDesk />} />
          </Route>
        </Routes>
      </Suspense>
    </LanguageProvider>
  );
}
