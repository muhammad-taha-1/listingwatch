// Fixed status colours, used for link state only (never for chart series).
// Always shown with an icon or label, so colour never carries meaning alone.
export const STATUS_COLOR = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
  neutral: '#898781',
} as const

export type StatusTone = keyof typeof STATUS_COLOR
