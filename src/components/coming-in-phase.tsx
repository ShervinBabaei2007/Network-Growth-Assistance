import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Honest placeholder for sections that a later build phase fills in. Shows no sample figures. */
export function ComingInPhase({
  title,
  phase,
  description,
}: {
  title: string;
  phase: number;
  description: string;
}) {
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Not built yet</CardTitle>
          <CardDescription>Planned for phase {phase}.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
      </Card>
    </div>
  );
}
