/** @jsxImportSource react */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from '@/frontend/router'

// SPAのエントリポイント。index.html(Viteのクライアントビルドのエントリ)から
// <script type="module">として読み込まれ、#root要素にReact Routerのルートを描画する
const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('#root要素が見つかりません')
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
