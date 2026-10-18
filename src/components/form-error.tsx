import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/** An error message for a form or a failed load: the shadcn Alert in its destructive tone, announced to screen readers. */
export function FormError({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Alert variant="destructive" className={cn("text-sm", className)}>
      <CircleAlert aria-hidden />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
