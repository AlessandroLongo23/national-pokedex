"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Placement = "top" | "bottom";

type TriggerHandlers = {
  "aria-describedby"?: string;
  onMouseEnter?: React.MouseEventHandler;
  onMouseLeave?: React.MouseEventHandler;
  onFocus?: React.FocusEventHandler;
  onBlur?: React.FocusEventHandler;
  onTouchStart?: React.TouchEventHandler;
};

interface Props {
  content: ReactNode;
  children: ReactElement<TriggerHandlers>;
  delay?: number;
  placement?: Placement;
  maxWidth?: number;
}

interface Position {
  top: number;
  left: number;
  placement: Placement;
}

const GAP = 6;
const VIEWPORT_PADDING = 8;

export function Tooltip({
  content,
  children,
  delay = 200,
  placement = "top",
  maxWidth = 280,
}: Props) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const showTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  useEffect(() => setMounted(true), []);

  const clearShowTimer = () => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  };

  const close = useCallback(() => {
    clearShowTimer();
    setOpen(false);
    setPosition(null);
  }, []);

  const scheduleShow = useCallback(
    (immediate = false) => {
      clearShowTimer();
      if (immediate || delay <= 0) {
        setOpen(true);
        return;
      }
      showTimer.current = window.setTimeout(() => setOpen(true), delay);
    },
    [delay],
  );

  useEffect(() => () => clearShowTimer(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onScroll = () => close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, close]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const tip = tooltipRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceAbove = trigger.top;
    const spaceBelow = vh - trigger.bottom;
    const needs = tip.height + GAP + VIEWPORT_PADDING;
    const finalPlacement: Placement =
      placement === "top" && spaceAbove < needs && spaceBelow >= needs
        ? "bottom"
        : placement === "bottom" && spaceBelow < needs && spaceAbove >= needs
          ? "top"
          : placement;

    const centerX = trigger.left + trigger.width / 2;
    let left = centerX - tip.width / 2;
    left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - tip.width - VIEWPORT_PADDING));
    const top =
      finalPlacement === "top"
        ? trigger.top - tip.height - GAP
        : trigger.bottom + GAP;

    setPosition({ top, left, placement: finalPlacement });
  }, [open, placement]);

  // Touch / outside-tap: dismiss when the user taps anywhere outside.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (
        target &&
        !triggerRef.current?.contains(target) &&
        !tooltipRef.current?.contains(target)
      ) {
        close();
      }
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open, close]);

  if (!isValidElement(children)) return children;

  const child = children;
  const childProps = child.props;
  const triggerProps: TriggerHandlers & { ref: (n: HTMLElement | null) => void } = {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const original = (child as unknown as { ref?: unknown }).ref;
      if (typeof original === "function") original(node);
      else if (original && typeof original === "object" && "current" in original) {
        (original as { current: HTMLElement | null }).current = node;
      }
    },
    "aria-describedby": open ? tooltipId : childProps["aria-describedby"],
    onMouseEnter: (e) => {
      scheduleShow();
      childProps.onMouseEnter?.(e);
    },
    onMouseLeave: (e) => {
      close();
      childProps.onMouseLeave?.(e);
    },
    onFocus: (e) => {
      scheduleShow(true);
      childProps.onFocus?.(e);
    },
    onBlur: (e) => {
      close();
      childProps.onBlur?.(e);
    },
    onTouchStart: (e) => {
      scheduleShow(true);
      childProps.onTouchStart?.(e);
    },
  };
  const trigger = cloneElement(child, triggerProps);

  return (
    <>
      {trigger}
      {mounted && open
        ? createPortal(
            <div
              ref={tooltipRef}
              role="tooltip"
              id={tooltipId}
              style={{
                position: "fixed",
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                maxWidth,
                pointerEvents: "none",
                opacity: position ? 1 : 0,
                transition: "opacity 120ms ease-out",
              }}
              className="z-50 rounded-md border border-border-strong bg-panel-3 px-2.5 py-1.5 text-xs leading-snug text-text shadow-[0_8px_24px_-12px_rgb(0_0_0/0.7)]"
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
