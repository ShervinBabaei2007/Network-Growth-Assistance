"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppSelectProps } from "@/components/app-select";
import { readOptions, selectChangeEvent } from "@/lib/ui/select-options";
import { cn } from "@/lib/utils";

/** The shadcn Select, driven by the `<option>` children of a native select so call sites don't change. */
export function DesktopSelect({ className, children, id, name, value, defaultValue, onChange, disabled, required, title, ...rest }: AppSelectProps) {
  const options = readOptions(children);
  const items = options.map(({ value: v, label }) => ({ value: v, label }));
  return (
    <Select
      id={id}
      name={name}
      items={items}
      value={value === undefined ? undefined : String(value)}
      defaultValue={defaultValue === undefined ? undefined : String(defaultValue)}
      disabled={disabled}
      required={required}
      onValueChange={(next) => {
        if (next !== null) onChange?.(selectChangeEvent(String(next), name));
      }}
    >
      <SelectTrigger
        className={cn("w-full", className)}
        title={title}
        aria-label={rest["aria-label"]}
        aria-labelledby={rest["aria-labelledby"]}
        aria-describedby={rest["aria-describedby"]}
        aria-invalid={rest["aria-invalid"]}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
