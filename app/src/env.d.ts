/**
 * Метка сборки. Подставляется Vite (см. `define` в vite.config.ts):
 * короткий git sha, а вне git-дерева — 'dev'.
 * Уходит в файл выгрузки параметров, чтобы было видно, чем он сделан.
 */
declare const __APP_VERSION__: string | undefined
