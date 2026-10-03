import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import { formatDateTime, formatShortDate, formatTime } from '../lib/format'
import type { CoveragePoint } from '../lib/runs'

// One series, so one hue and no legend: the card title names it.
const SERIES = '#2a78d6'
const SURFACE = '#ffffff'
const GRID = '#e1e0d9'
const AXIS_TEXT = '#898781'
const CURSOR = '#c3c2b7'

function CoverageTooltip({ active, payload }: TooltipContentProps) {
  const point = payload?.[0]?.payload as CoveragePoint | undefined
  if (!active || !point) return null
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="text-sm font-semibold text-slate-900">{point.coverage}%</p>
      <p className="text-slate-600">
        {point.ok} of {point.checked} links ok
      </p>
      <p className="text-slate-500">{formatDateTime(point.startedAt)}</p>
    </div>
  )
}

export default function CoverageChart({ points }: { points: CoveragePoint[] }) {
  const first = points[0]
  const last = points.at(-1)
  // Runs within one day would all read "1 Oct"; label them by time instead.
  const withinADay =
    first && last && Date.parse(last.startedAt) - Date.parse(first.startedAt) < 24 * 60 * 60_000
  const tickFormatter = withinADay ? formatTime : formatShortDate

  return (
    <div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="startedAt"
              tickFormatter={tickFormatter}
              tick={{ fill: AXIS_TEXT, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: CURSOR }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(value: number) => `${value}%`}
              tick={{ fill: AXIS_TEXT, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={CoverageTooltip} cursor={{ stroke: CURSOR, strokeWidth: 1 }} />
            <Area
              type="linear"
              dataKey="coverage"
              stroke={SERIES}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill={SERIES}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 5, fill: SERIES, stroke: SURFACE, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            {last && (
              <ReferenceDot
                x={last.startedAt}
                y={last.coverage}
                r={4}
                fill={SERIES}
                stroke={SURFACE}
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-slate-600 hover:text-slate-900">Show as table</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 font-medium">Run started</th>
              <th className="py-1 font-medium">Coverage</th>
              <th className="py-1 font-medium">Links ok</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((point) => (
              <tr key={point.runId} className="border-t border-slate-100">
                <td className="py-1">{formatDateTime(point.startedAt)}</td>
                <td className="py-1">{point.coverage}%</td>
                <td className="py-1">
                  {point.ok} of {point.checked}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
