import { Children, Fragment, isValidElement, type ChangeEvent, type ReactElement, type ReactNode } from "react";

export type SelectOption = { value: string; label: ReactNode; disabled: boolean };

/**
 * Reads the `<option>` elements a native select was written with, so the same markup can drive the desktop select.
 * Fragments and arrays (from `.map`) are flattened; anything that isn't an option is ignored.
 */
export function readOptions(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  const visit = (node: ReactNode) => {
    for (const child of Children.toArray(node)) {
      if (!isValidElement(child)) continue;
      const el = child as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>;
      if (el.type === Fragment) {
        visit(el.props.children);
      } else if (el.type === "option" || (typeof el.type !== "string" && (el.type as { displayName?: string }).displayName === "AppSelectOption")) {
        const text = el.props.children;
        out.push({ value: el.props.value === undefined ? textOf(text) : String(el.props.value), label: text, disabled: Boolean(el.props.disabled) });
      }
    }
  };
  visit(children);
  return out;
}

/** An option with no value attribute submits its text, as in HTML. */
function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((n) => (typeof n === "string" || typeof n === "number" ? String(n) : ""))
    .join("");
}

/**
 * What a change handler written for `<select onChange={(e) => e.target.value}>` receives from the desktop
 * select: the pieces of the event those handlers read.
 */
export function selectChangeEvent(value: string, name?: string): ChangeEvent<HTMLSelectElement> {
  const target = { value, name: name ?? "" };
  return { target, currentTarget: target } as unknown as ChangeEvent<HTMLSelectElement>;
}

const LAYOUT_CLASS = /^(?:w|min-w|max-w|flex|grow|shrink|basis|self|col|row|order|m[trblxy]?)-|^(?:grow|shrink)$/;

/** Splits a class list into the part that places the select in a layout and the part that styles the control. */
export function splitClasses(className?: string): [layout: string, control: string] {
  const layout: string[] = [];
  const control: string[] = [];
  for (const c of (className ?? "").split(/\s+/).filter(Boolean)) (LAYOUT_CLASS.test(c.replace(/^(?:[a-z0-9]+:)+/, "")) ? layout : control).push(c);
  return [layout.join(" "), control.join(" ")];
}

