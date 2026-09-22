/** @jsxImportSource react */
import { createBrowserRouter } from 'react-router'
import { AppLayout, requireSessionLoader } from '@/frontend/layouts/app-layout'
import { PublicLayout } from '@/frontend/layouts/public-layout'
import { AccountDeletionPage } from '@/frontend/routes/app/account-deletion-page'
import { AccountSettingsPage, accountSettingsLoader } from '@/frontend/routes/app/account-settings-page'
import { DashboardPage, dashboardLoader } from '@/frontend/routes/app/dashboard-page'
import { LinkCreatePage } from '@/frontend/routes/app/link-create-page'
import { LinkDetailPage, linkDetailLoader } from '@/frontend/routes/app/link-detail-page'
import { PosterCreatePage, posterCreateLoader } from '@/frontend/routes/app/poster-create-page'
import { PosterEditorPage, posterEditorLoader } from '@/frontend/routes/app/poster-editor-page'
import { QrCodeCreatePage, qrcodeCreateLoader } from '@/frontend/routes/app/qrcode-create-page'
import { QrCodeEditorPage, qrcodeEditorLoader } from '@/frontend/routes/app/qrcode-editor-page'
import { LoginPage } from '@/frontend/routes/login-page'
import { PrivacyPage } from '@/frontend/routes/privacy-page'
import { ResetPasswordConfirmPage } from '@/frontend/routes/reset-password-confirm-page'
import { ResetPasswordRequestPage } from '@/frontend/routes/reset-password-request-page'
import { SignupPage } from '@/frontend/routes/signup-page'
import { TermsPage } from '@/frontend/routes/terms-page'
import { TopPage } from '@/frontend/routes/top-page'
import { VerifyEmailPendingPage } from '@/frontend/routes/verify-email-pending-page'

// アプリ全体のルート定義(React Router data mode)。
// Hono側(src/index.tsx)のFRONTEND_PUBLIC_PATHS・/app/*の予約と対応関係にあるため、
// パスを変更する場合は必ずsrc/index.tsx側も合わせて更新すること。
//
// 公開画面(PublicLayout配下)と、ログイン必須のアプリ画面(AppLayout配下、
// requireSessionLoaderでガードされる)の2グループに分かれる
export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <TopPage /> },
      { path: '/terms', element: <TermsPage /> },
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/verify-email', element: <VerifyEmailPendingPage /> },
      { path: '/reset-password', element: <ResetPasswordRequestPage /> },
      { path: '/reset-password/confirm', element: <ResetPasswordConfirmPage /> },
    ],
  },
  {
    path: '/app',
    element: <AppLayout />,
    loader: requireSessionLoader,
    children: [
      { index: true, element: <DashboardPage />, loader: dashboardLoader },
      { path: 'links/new', element: <LinkCreatePage /> },
      { path: 'links/:linkId', element: <LinkDetailPage />, loader: linkDetailLoader },
      { path: 'links/:linkId/qrcodes/new', element: <QrCodeCreatePage />, loader: qrcodeCreateLoader },
      { path: 'qrcodes/new', element: <QrCodeCreatePage />, loader: qrcodeCreateLoader },
      { path: 'qrcodes/:qrCodeId', element: <QrCodeEditorPage />, loader: qrcodeEditorLoader },
      { path: 'qrcodes/:qrCodeId/posters/new', element: <PosterCreatePage />, loader: posterCreateLoader },
      { path: 'posters/:posterId', element: <PosterEditorPage />, loader: posterEditorLoader },
      { path: 'account', element: <AccountSettingsPage />, loader: accountSettingsLoader },
      { path: 'account/delete', element: <AccountDeletionPage /> },
    ],
  },
])
