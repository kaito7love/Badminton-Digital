import React, { lazy } from 'react';
import { Route } from 'react-router-dom';

// Toàn bộ route của tính năng thi đấu — app chính chỉ chèn `{competitionStaffRoutes}` vào AppRoutes (Fragment hợp lệ trong
// <Routes> của react-router 6). Trang nào cũng lazy-load: không kéo mã thi đấu (và recharts) vào các trang không dùng.
// Tháo tính năng: xoá thư mục `features/competition`, các dòng tham chiếu ở AppRoutes / SidebarLayout / App.

const CompetitionHome = lazy(() => import('./pages/CompetitionHome'));
const TournamentsPage = lazy(() => import('./pages/tournaments/TournamentsPage'));
const TournamentFormPage = lazy(() => import('./pages/tournaments/TournamentFormPage'));
const TournamentDetailPage = lazy(() => import('./pages/tournaments/TournamentDetailPage'));

/** Nằm trong khối STAFF_ROLES của AppRoutes (cùng SidebarLayout). */
export const competitionStaffRoutes = (
  <>
    <Route path="/competition" element={<CompetitionHome />} />
    <Route path="/competition/tournaments" element={<TournamentsPage />} />
    <Route path="/competition/tournaments/new" element={<TournamentFormPage />} />
    <Route path="/competition/tournaments/:id" element={<TournamentDetailPage />} />
  </>
);
