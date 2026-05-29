"use client";

import type { ReactElement, ReactNode } from "react";
import { Tooltip as UITooltip } from "@/lib/components/ui/Tooltip";

interface Props {
  content?: ReactNode;
  children: ReactElement;
  delay?: number;
  placement?: "top" | "right" | "bottom" | "left";
}

export function Tooltip({ content, children, delay, placement }: Props) {
  const label = typeof content === "string" ? content : undefined;
  return (
    <UITooltip label={label} side={placement} delay={delay}>
      {children}
    </UITooltip>
  );
}
