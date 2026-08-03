/**
 * Общая подготовка тестов.
 *
 * Часть файлов идёт в окружении node (расчёт, сервер), часть — в happy-dom
 * (экраны). Поэтому всё, что связано с DOM, делается только когда DOM есть.
 *
 * Между тестами интерфейса хранилище браузера обнуляется: иначе набор
 * параметров из предыдущего теста протечёт в следующий, и «Вернуть базовые
 * значения» начнёт проверяться на чужих цифрах.
 */

import { afterEach, beforeEach } from 'vitest'
import { resetPaletteCache } from '../src/charts/palette'

const hasDom = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined'

beforeEach(() => {
  if (!hasDom()) return
  localStorage.clear()
  resetPaletteCache()
})

afterEach(async () => {
  if (!hasDom()) return
  const { cleanup } = await import('@testing-library/react')
  cleanup()
  localStorage.clear()
})
