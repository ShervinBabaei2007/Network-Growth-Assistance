import { PROVINCE_CODES, type ProvinceCode } from "./types";

/** The provinces a user chose, in the usual order, ignoring anything that isn't a province. No province is preferred over another. */
export function validProvinces(provinces: readonly string[]): ProvinceCode[] {
  return PROVINCE_CODES.filter((p) => provinces.includes(p));
}
