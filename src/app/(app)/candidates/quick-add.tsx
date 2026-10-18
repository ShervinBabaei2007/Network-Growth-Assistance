import { ActionForm } from "@/components/action-form";
import { Checkbox } from "@/components/ui/checkbox";
import { AppSelect } from "@/components/app-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEGREE_LABELS } from "@/lib/domain";
import { addCandidate } from "./actions";

export function QuickAddForm() {
  return (
    <ActionForm action={addCandidate} submitLabel="Add candidate" resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="profileUrl">LinkedIn profile URL</Label>
          <Input id="profileUrl" name="profileUrl" placeholder="https://www.linkedin.com/in/…" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fullName">Name</Label>
          <Input id="fullName" name="fullName" required maxLength={200} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="role">Current role or headline</Label>
          <Input id="role" name="role" maxLength={300} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="schoolText">School (as shown on the profile)</Label>
          <Input id="schoolText" name="schoolText" maxLength={300} placeholder="As the profile shows it" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="programText">Program or major (as shown)</Label>
          <Input id="programText" name="programText" maxLength={300} placeholder="As the profile shows it" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="degreeLevel">Degree level</Label>
          <AppSelect id="degreeLevel" name="degreeLevel" defaultValue="">
            <option value="">Unknown</option>
            {Object.entries(DEGREE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </AppSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="gradYear">Graduation year</Label>
          <Input id="gradYear" name="gradYear" type="number" min={1950} max={2100} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Networking notes</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            maxLength={2000}
            placeholder="Shared club, project or interest you saw on their profile"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="approve" />
        Approve for outreach now (only if the school and program are recognized)
      </label>
      <p className="text-xs text-muted-foreground">
        Copy what the profile actually says. The school and program are matched automatically;
        anything unclear is held for your review rather than guessed.
      </p>
    </ActionForm>
  );
}
