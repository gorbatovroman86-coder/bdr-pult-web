import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * base задаётся переменной окружения, чтобы одна и та же сборка годилась
 * и для локального просмотра, и для GitHub Pages: сайт проекта живёт
 * в подпапке /<имя-репозитория>/. В workflow значение подставляется само.
 */
export default defineConfig({
  base: process.env.PUBLIC_BASE ?? '/',
  plugins: [react()],
})
