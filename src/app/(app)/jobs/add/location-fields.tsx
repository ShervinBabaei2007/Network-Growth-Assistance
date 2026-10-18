"use client";

import { useEffect, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { Label } from "@/components/ui/label";

/** Sent by the quick fill so these two fields change through React, whichever kind of select is showing. */
export const FILL_LOCATION_EVENT = "posting-fill-location";
export type FillLocationDetail = { country?: string; province?: string };

/** Country and province of the posting form. Controlled, so a fill can't be lost when the desktop select replaces the native one. */
export function LocationFields({
  countries,
  provinces,
  defaultCountry,
}: {
  countries: { code: string; name: string }[];
  provinces: { code: string; name: string }[];
  defaultCountry: string;
}) {
  const [country, setCountry] = useState(defaultCountry);
  const [province, setProvince] = useState("");

  useEffect(() => {
    const onFill = (e: Event) => {
      const d = (e as CustomEvent<FillLocationDetail>).detail;
      if (d.country) setCountry(d.country);
      if (d.province) setProvince(d.province);
    };
    window.addEventListener(FILL_LOCATION_EVENT, onFill);
    return () => window.removeEventListener(FILL_LOCATION_EVENT, onFill);
  }, []);

  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="country">Country</Label>
        <AppSelect id="country" name="country" value={country} onChange={(e) => setCountry(e.target.value)}>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </AppSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="province">Province (jobs in Canada)</Label>
        <AppSelect id="province" name="province" value={province} onChange={(e) => setProvince(e.target.value)}>
          <option value="">None, or remote</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </AppSelect>
      </div>
    </>
  );
}
