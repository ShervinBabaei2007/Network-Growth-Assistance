import { LocaleScope } from "@/components/locale-scope";
import { ViewsMenu, type SavedView } from "@/components/views-menu";
import type { ViewPage } from "@/lib/views";

/** The saved-views panel in the person's language. */
export function SavedViews({ page, views }: { page: ViewPage; views: SavedView[] }) {
  return (
    <LocaleScope groups={["views"]}>
      <ViewsMenu page={page} views={views} />
    </LocaleScope>
  );
}
