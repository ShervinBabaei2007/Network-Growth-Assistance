import { recordSnapshot, setBaseline } from "@/app/(app)/actions";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BaselineForm({ today }: { today: string }) {
  return (
    <ActionForm action={setBaseline} submitLabel="Save starting count">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="baseline">Connections when you started</Label>
          <Input id="baseline" name="baseline" type="number" min={0} max={30000} inputMode="numeric" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="startDate">Project start date</Label>
          <Input id="startDate" name="startDate" type="date" max={today} defaultValue={today} required />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Use the number on your LinkedIn profile or the “My Network” page.
      </p>
    </ActionForm>
  );
}

export function SnapshotForm({ today }: { today: string }) {
  return (
    <ActionForm action={recordSnapshot} submitLabel="Record count" variant="outline">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="total">Total connections now</Label>
          <Input id="total" name="total" type="number" min={0} max={30000} inputMode="numeric" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="date">As of</Label>
          <Input id="date" name="date" type="date" max={today} defaultValue={today} required />
        </div>
      </div>
    </ActionForm>
  );
}
