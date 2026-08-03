/** Тексты и справочные величины, не участвующие в расчёте. */

export const ASSUMPTIONS = [
  {
    kind: 'simplification' as const,
    text: 'Стоимость переработки одинакова независимо от числа переделов. М3 не прессует, но платит столько же.',
    ref: 'Q5',
  },
  {
    kind: 'simplification' as const,
    text: 'Потери 1 % есть у всех, кроме М3 — балансы выходов разные.',
    ref: 'Q9',
  },
  {
    kind: 'simplification' as const,
    text: 'Лузга топит котёл в М2, М3 и М5; пока экономия на топливе не задана, она не учтена. М1 и М4 топят покупным при той же ставке переработки.',
    ref: 'Q3',
  },
]

/** Блок U:W книги — фактические замеры. Справочная сверка, не параметр. */
export const MEASURED = {
  kernelShare: 0.5703795,
  semiShare: 0.0371295,
  cat3Share: 0.0731392,
  sumShare: 0.6806482,
  planShare: 0.7,
}

export const PRODUCT_DESTINATION: Record<string, string> = {
  kernel: 'Китай', semi: 'Китай', cat3: 'Китай', oil: 'Китай', meal: 'Китай',
}
