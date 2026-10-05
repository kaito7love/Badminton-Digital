import React, { lazy } from 'react';
import { Route } from 'react-router-dom';

// Toàn bộ route của tính năng thi đấu — app chính chỉ chèn `{competitionStaffRoutes}` vào AppRoutes (Fragment hợp lệ trong
// <Routes> của react-router 6). Trang nào cũng lazy-load: không kéo mã thi đấu (và recharts) vào các trang không dùng.
// Tháo tính năng: xoá thư mục `features/competition`, các dòng tham chiếu ở AppRoutes / SidebarLayout / App.

const CompetitionHome = lazy(() => import('./pages/CompetitionHome'));
const TournamentsPage = lazy(() => import('./pages/tournaments/TournamentsPage'));
const TournamentFormPage = lazy(() => import('./pages/tournaments/TournamentFormPage'));
const TournamentDetailPage = lazy(() => import('./pages/tournaments/TournamentDetailPage'));
const SessionsPage = lazy(() => import('./pages/sessions/SessionsPage'));
const SessionDetailPage = lazy(() => import('./pages/sessions/SessionDetailPage'));
const PlayersPage = lazy(() => import('./pages/players/PlayersPage'));
const PlayerProfilePage = lazy(() => import('./pages/players/PlayerProfilePage'));
const PlayerAssessPage = lazy(() => import('./pages/players/PlayerAssessPage'));
const ReviewsPage = lazy(() => import('./pages/reviews/ReviewsPage'));
const LiveScorePage = lazy(() => import('./pages/live/LiveScorePage'));
const QuickScorePage = lazy(() => import('./pages/live/QuickScorePage'));
const TournamentBoardPage = lazy(() => import('./pages/board/TournamentBoardPage'));
const SessionBoardPage = lazy(() => import('./pages/board/SessionBoardPage'));

/** Nằm trong khối STAFF_ROLES của AppRoutes (cùng SidebarLayout). */
export const competitionStaffRoutes = (
  <>
    <Route path="/competition" element={<CompetitionHome />} />
    <Route path="/competition/tournaments" element={<TournamentsPage />} />
    <Route path="/competition/tournaments/new" element={<TournamentFormPage />} />
    <Route path="/competition/tournaments/:id" element={<TournamentDetailPage />} />
    <Route path="/competition/tournaments/:id/board" element={<TournamentBoardPage />} />
    <Route path="/competition/sessions" element={<SessionsPage />} />
    <Route path="/competition/sessions/:id" element={<SessionDetailPage />} />
    <Route path="/competition/sessions/:id/board" element={<SessionBoardPage />} />
    <Route path="/competition/players" element={<PlayersPage />} />
    <Route path="/competition/players/:id" element={<PlayerProfilePage />} />
    <Route path="/competition/players/:id/assess" element={<PlayerAssessPage />} />
    <Route path="/competition/reviews" element={<ReviewsPage />} />
    <Route path="/competition/live/:matchId" element={<LiveScorePage />} />
    <Route path="/competition/score/:matchId" element={<QuickScorePage />} />
  </>
);
