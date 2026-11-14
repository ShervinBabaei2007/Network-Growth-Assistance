# Glossary

Terms the code and the team use for the same thing. Add a term when a module is named after it.

## Mutation

One server action's change to the user's data, from the button press to the message they see. The **mutation module** (`src/lib/server/mutation.ts`) owns the whole lifecycle: it checks the ids, opens the signed-in context, runs the change, turns the outcome into a message in the person's language (`done` or `fail`), writes the activity log entry and refreshes the page. An action file supplies only the change itself.

- A mutation returns one result shape, `ActionResult<T>`. Forms convert it with `toFormState` at the edge.
- Every message is a catalogue key. `verbatim(text)` is the one way to pass text that is already final, such as a reason a library produced.
- Tests drive it through `createMutate` in `mutation-core.ts` with their own context, translator, refresh and log.

## List view

What a list page (People, Candidates, Applications, Jobs, Connections) does with its URL. The **list-view module** (`src/lib/list-view.ts`) reads a search parameter, works out the page and page size, turns the search box into a PostgREST filter, and builds the link to another page of the same filters. `listHref` takes its keys and their order from the saved-view keys in `src/lib/views.ts`, so a list's links and its saved views cannot drift apart.

## Saved view

A list's filters kept under a name. Stored as the URL's search string (`saved_views` table), so applying one is just opening that URL. `loadSavedViews` (`src/lib/data/saved-views.ts`) reads them for a list.

## Bulk change

A change to many ticked rows at once, capped at 200 (`MAX_SELECTION`). Each bulk action keeps its own rule for which rows are eligible and what changes; the **bulk-change module** (`src/lib/server/bulk-change.ts`) holds what they share: reading the ticked ids (`selectedIds`), saying how many were skipped (`withSkipped`), and **Undo** (`restoreByPrevious`), which puts rows back one previous value at a time and only where the row still holds the value the change gave it.

## Connected person

A saved person the user has said they are connected to. Setting the CRM status to "connected", by one action or in bulk, also marks them as a known connection (`CONNECTED_PATCH` in `src/lib/people/crm.ts`). The single-person and bulk actions share that rule and the other CRM status rules there.
