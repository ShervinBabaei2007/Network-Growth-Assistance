import Link from "next/link";
import { Bell } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/** The header's bell, with the number of unread notifications. */
export async function NotificationBell() {
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  const unread = count ?? 0;
  return (
    <Link href="/notifications" data-tour="bell" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} title="Notifications" className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}>
      <Bell aria-hidden />
      {unread ? (
        <span aria-hidden className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[0.65rem] leading-4 font-semibold text-primary-foreground tabular-nums">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
