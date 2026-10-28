/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_API_KEY?: string
  readonly VITE_APP_MODE?: 'agent' | 'admin'
  readonly VITE_API_BASE?: string
  readonly VITE_PDF_DESIGN?: 'v3' | 'template'
  readonly VITE_TEST_MODE?: '1'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
