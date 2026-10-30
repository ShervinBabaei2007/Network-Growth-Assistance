import { LoadExampleButton } from "@/components/load-example-button";
import { isEmptyAccount } from "@/lib/data/empty-account";

/**
 * The "Load example data" action for an empty page, shown only while the account is truly empty (otherwise the
 * request would be refused). Use inside an EmptyState's actions; render nothing when it doesn't apply.
 */
export async function LoadExample() {
  return (await isEmptyAccount()) ? <LoadExampleButton /> : null;
}
