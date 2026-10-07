import React, { lazy } from 'react';
import { Route } from 'react-router-dom';
import ProtectedRoute from '../../routes/ProtectedRoute';
import FeatureGate from './components/FeatureGate';

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
const MyRatingPage = lazy(() => import('./pages/me/MyRatingPage'));
const SelfAssessPage = lazy(() => import('./pages/me/SelfAssessPage'));
const MyProfilePage = lazy(() => import('./pages/me/MyProfilePage'));
const MyTournamentsPage = lazy(() => import('./pages/me/MyTournamentsPage'));
const RankingsPage = lazy(() => import('./pages/public/RankingsPage'));
const PublicProfilePage = lazy(() => import('./pages/public/PublicProfilePage'));
const HubPage = lazy(() => import('./pages/hub/HubPage'));
const PublicTournamentPage = lazy(() => import('./pages/hub/PublicTournamentPage'));
const PublicSessionPage = lazy(() => import('./pages/hub/PublicSessionPage'));
const LiveScorePage = lazy(() => import('./pages/live/LiveScorePage'));
const QuickScorePage = lazy(() => import('./pages/live/QuickScorePage'));
const TournamentBoardPage = lazy(() => import('./pages/board/TournamentBoardPage'));
const SessionBoardPage = lazy(() => import('./pages/board/SessionBoardPage'));

/** Nằm trong khối STAFF_ROLES của AppRoutes (cùng SidebarLayout). */
export const competitionStaffRoutes = (
  <>
    <Route path="/competition" element={<CompetitionHome />} />
    <Route path="/competition/tournaments" element={<FeatureGate><TournamentsPage /></FeatureGate>} />
    <Route path="/competition/tournaments/new" element={<FeatureGate><TournamentFormPage /></FeatureGate>} />
    <Route path="/competition/tournaments/:id" element={<FeatureGate><TournamentDetailPage /></FeatureGate>} />
    <Route path="/competition/tournaments/:id/board" element={<FeatureGate><TournamentBoardPage /></FeatureGate>} />
    <Route path="/competition/sessions" element={<FeatureGate><SessionsPage /></FeatureGate>} />
    <Route path="/competition/sessions/:id" element={<FeatureGate><SessionDetailPage /></FeatureGate>} />
    <Route path="/competition/sessions/:id/board" element={<FeatureGate><SessionBoardPage /></FeatureGate>} />
    <Route path="/competition/players" element={<FeatureGate><PlayersPage /></FeatureGate>} />
    <Route path="/competition/players/:id" element={<FeatureGate><PlayerProfilePage /></FeatureGate>} />
    <Route path="/competition/players/:id/assess" element={<FeatureGate><PlayerAssessPage /></FeatureGate>} />
    <Route path="/competition/reviews" element={<FeatureGate><ReviewsPage /></FeatureGate>} />
    <Route path="/competition/live/:matchId" element={<FeatureGate><LiveScorePage /></FeatureGate>} />
    <Route path="/competition/score/:matchId" element={<FeatureGate><QuickScorePage /></FeatureGate>} />
  </>
);

/** Trang của khách đã đăng nhập (đặt cạnh /my-bookings, /account trong AppRoutes). */
export const competitionCustomerRoutes = (
  <>
    <Route path="/my-rating" element={<ProtectedRoute roles={['customer']}><FeatureGate customer><MyRatingPage /></FeatureGate></ProtectedRoute>} />
    <Route path="/my-rating/assess" element={<ProtectedRoute roles={['customer']}><FeatureGate customer><SelfAssessPage /></FeatureGate></ProtectedRoute>} />
    <Route path="/my-rating/profile" element={<ProtectedRoute roles={['customer']}><FeatureGate customer><MyProfilePage /></FeatureGate></ProtectedRoute>} />
    <Route path="/my-tournaments" element={<ProtectedRoute roles={['customer']}><FeatureGate customer><MyTournamentsPage /></FeatureGate></ProtectedRoute>} />
    <Route path="/my-matches/:matchId/score" element={<ProtectedRoute roles={['customer']}><FeatureGate customer><LiveScorePage mode="player" /></FeatureGate></ProtectedRoute>} />
  </>
);

/**
 * Công khai: bảng xếp hạng (chưa đăng nhập xem được, người "Thành viên" bị che tên), hồ sơ người khác (service quyết định theo quyền riêng tư) và khu
 * "Thi đấu" /thi-dau (plan 27): xem giải / buổi giao lưu không cần đăng nhập, đăng ký cần tài khoản khách. Khu này có khung riêng (PublicShell).
 */
export const competitionPublicRoutes = (
  <>
    <Route path="/thi-dau" element={<FeatureGate hub><HubPage /></FeatureGate>} />
    <Route path="/thi-dau/giai/:id" element={<FeatureGate hub><PublicTournamentPage /></FeatureGate>} />
    <Route path="/thi-dau/giao-luu/:id" element={<FeatureGate hub><PublicSessionPage /></FeatureGate>} />
    <Route path="/rankings" element={<FeatureGate customer><RankingsPage /></FeatureGate>} />
    <Route path="/players/:id" element={<FeatureGate customer><PublicProfilePage /></FeatureGate>} />
  </>
);
