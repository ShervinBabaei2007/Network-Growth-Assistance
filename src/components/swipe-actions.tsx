"use client";

import { useRef, useState, type ReactNode } from "react";

/** Width of the revealed action tray, in pixels. */
const TRAY = 188;
/** How far a finger has to drag before the tray stays open. */
const OPEN_AT = TRAY * 0.4;
/** A drag under this is a tap, not a swipe. */
const SLOP = 8;

/**
 * Swipe a card left to reveal quick actions, on a touchscreen. It only reveals buttons: nothing is recorded by the
 * swipe itself, so an accidental swipe changes nothing. The same actions are always available as ordinary buttons on
 * the card, which is the path for keyboards, screen readers and mice; the tray is hidden from them (inert and
 * aria-hidden) while it is closed so nothing is announced twice. Respects "reduce motion" through the page's CSS.
 */
export function SwipeActions({ children, actions, label }: { children: ReactNode; actions: ReactNode; label: string }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const moved = useRef(false);
  const open = offset === -TRAY;

  const end = () => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    setOffset((o) => (o <= -OPEN_AT ? -TRAY : 0));
  };

  return (
    <div className="relative overflow-hidden rounded-xl" data-testid="swipe-row">
      <div
        role="group"
        aria-label={label}
        aria-hidden={!open}
        inert={!open}
        className="absolute inset-y-0 right-0 flex items-center justify-end gap-2 bg-muted px-3"
        style={{ width: TRAY }}
      >
        {actions}
      </div>
      <div
        className="relative touch-pan-y bg-background will-change-transform"
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 160ms ease-out" }}
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") return;
          start.current = { x: e.clientX, y: e.clientY, base: offset };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (!moved.current) {
            // A mostly vertical gesture is a scroll: leave it to the browser.
            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SLOP) {
              start.current = null;
              return;
            }
            if (Math.abs(dx) < SLOP) return;
            moved.current = true;
            setDragging(true);
          }
          setOffset(Math.min(0, Math.max(-TRAY, s.base + dx)));
        }}
        onPointerUp={end}
        onPointerCancel={end}
        // A tap on an open card closes it instead of following whatever it landed on.
        onClickCapture={(e) => {
          if (offset !== 0 && !moved.current) {
            e.preventDefault();
            e.stopPropagation();
            setOffset(0);
          }
          moved.current = false;
        }}
      >
        {children}
      </div>
    </div>
  );
}
