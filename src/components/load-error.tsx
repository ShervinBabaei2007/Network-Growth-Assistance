export function LoadError({ what }: { what: string }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      Couldn&apos;t load {what}. Refresh the page; if it keeps happening, sign out and back in.
    </p>
  );
}
