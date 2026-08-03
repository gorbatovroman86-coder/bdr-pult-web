import { execSync } from 'node:child_process'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Метка сборки для файла выгрузки параметров: короткий git sha.
 * Вне git-дерева (распакованный архив) — 'dev'. Падать из-за метки нельзя.
 */
function buildVersion(): string {
  if (process.env.PUBLIC_VERSION) return process.env.PUBLIC_VERSION
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'dev'
  }
}

/**
 * base задаётся переменной окружения, чтобы одна и та же сборка годилась
 * и для локального просмотра, и для GitHub Pages: сайт проекта живёт
 * в подпапке /<имя-репозитория>/. В workflow значение подставляется само.
 */
export default defineConfig({
  base: process.env.PUBLIC_BASE ?? '/',
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
    // Адрес хранилища. В репозитории пусто намеренно: значение приходит
    // переменной окружения при сборке либо вводится в самом пульте.
    __API_BASE__: JSON.stringify(process.env.PUBLIC_API_BASE ?? ''),
  },
  plugins: [react()],
  test: {
    // Окружение по умолчанию — node: серверные тесты работают с `node:sqlite`,
    // который в клиентском окружении не собирается. DOM включается пофайлово
    // строкой `// @vitest-environment happy-dom` — он нужен только экранам.
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true,
  },
})
