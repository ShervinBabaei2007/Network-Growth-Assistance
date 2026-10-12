"use client";

import { useId } from "react";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AlertValue = { name: string; frequency: "off" | "daily" | "weekly"; weekday: number; hour: number; emailDigest: boolean };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hourLabel = (h: number) => new Date(Date.UTC(2026, 0, 1, h)).toLocaleTimeString("en-CA", { hour: "numeric", timeZone: "UTC" });

/** Name, how often to alert, when (in the user's own time zone) and whether to email. */
export function AlertFields({ value, onChange, emailAvailable, timeZone }: { value: AlertValue; onChange: (v: AlertValue) => void; emailAvailable: boolean; timeZone: string }) {
  const id = useId();
  const set = <K extends keyof AlertValue>(k: K, v: AlertValue[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input id={`${id}-name`} required maxLength={120} value={value.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor={`${id}-freq`}>Alert me</Label>
          <NativeSelect id={`${id}-freq`} value={value.frequency} onChange={(e) => set("frequency", e.target.value as AlertValue["frequency"])}>
            <option value="off">Never</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </NativeSelect>
        </div>
        {value.frequency === "weekly" ? (
          <div className="grid gap-1">
            <Label htmlFor={`${id}-day`}>On</Label>
            <NativeSelect id={`${id}-day`} value={value.weekday} onChange={(e) => set("weekday", Number(e.target.value))}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        {value.frequency !== "off" ? (
          <div className="grid gap-1">
            <Label htmlFor={`${id}-hour`}>At</Label>
            <NativeSelect id={`${id}-hour`} value={value.hour} onChange={(e) => set("hour", Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
      </div>
      {value.frequency !== "off" ? <p className="text-xs text-muted-foreground">Times are in your time zone ({timeZone}). New jobs appear in your notifications.</p> : null}
      {value.frequency !== "off" ? (
        emailAvailable ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={value.emailDigest} onChange={(e) => set("emailDigest", e.target.checked)} />
            Also email me (needs email turned on in Settings → Notifications)
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">Email alerts aren&apos;t set up on this server; you&apos;ll get them in the app.</p>
        )
      ) : null}
    </div>
  );
}
