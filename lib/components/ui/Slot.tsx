"use client";

import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

type AnyProps = Record<string, unknown>;

interface SlotProps extends AnyProps {
  children?: ReactNode;
}

export function Slot({ children, ...slotProps }: SlotProps) {
  if (!isValidElement(children)) return null;
  const child = children as ReactElement<AnyProps & { children?: ReactNode }>;
  const merged = mergeProps(slotProps, child.props);
  return cloneElement(child, merged, child.props.children as ReactNode);
}

function mergeProps(slot: AnyProps, child: AnyProps): AnyProps {
  const merged: AnyProps = { ...slot };

  for (const key of Object.keys(child)) {
    const slotValue = slot[key];
    const childValue = child[key];

    if (key === "className") {
      merged[key] = [slotValue, childValue].filter(Boolean).join(" ");
    } else if (key === "style") {
      merged[key] = { ...(slotValue as object), ...(childValue as object) };
    } else if (typeof slotValue === "function" && typeof childValue === "function") {
      merged[key] = (...args: unknown[]) => {
        (childValue as (...a: unknown[]) => unknown)(...args);
        (slotValue as (...a: unknown[]) => unknown)(...args);
      };
    } else {
      merged[key] = childValue !== undefined ? childValue : slotValue;
    }
  }

  return merged;
}
