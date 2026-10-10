"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AXIS = { fontSize: 12, fill: "var(--muted-foreground)" };
const shortDate = (d: string) => {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
};

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: { value: number }[]; label?: string | number; unit: string }) {
  if (!active || !payload?.length) return null;
  // Time axes pass a timestamp; category axes pass the date string.
  const title = typeof label === "number" ? new Date(label).toISOString().slice(0, 10) : label;
  return (
    <div className="rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm">
      <p className="font-medium">{title}</p>
      <p>
        {payload[0].value.toLocaleString("en-CA")} {unit}
      </p>
    </div>
  );
}

/** One series of daily counts as thin bars; the card title names the series. */
export function DailyBars({
  data,
  dataKey,
  unit,
  label,
}: {
  data: { date: string; [k: string]: number | string }[];
  dataKey: string;
  unit: string;
  label: string;
}) {
  return (
    <div role="img" aria-label={label} className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={40} />
          <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip unit={unit} />} />
          <Bar dataKey={dataKey} fill="var(--meter-fill)" radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const fromTime = (t: number) => shortDate(new Date(t).toISOString().slice(0, 10));

/** Recorded network totals over time, on a true time axis so gaps between counts show as gaps. */
export function NetworkLine({ data, label }: { data: { date: string; total: number }[]; label: string }) {
  const points = data.map((d) => ({ ...d, t: Date.parse(`${d.date}T12:00:00Z`) }));
  return (
    <div role="img" aria-label={label} className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fromTime} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis domain={["dataMin - 10", "dataMax + 10"]} allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={52} />
          <Tooltip content={<ChartTooltip unit="connections" />} />
          <Line
            type="linear"
            dataKey="total"
            stroke="var(--meter-fill)"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, fill: "var(--background)" }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
