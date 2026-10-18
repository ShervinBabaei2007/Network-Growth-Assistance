import { FormError } from "@/components/form-error";

export function LoadError({ what }: { what: string }) {
  return <FormError>Couldn&apos;t load {what}. Refresh the page; if it keeps happening, sign out and back in.</FormError>;
}
