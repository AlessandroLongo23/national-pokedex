"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ComponentType,
  type SVGProps,
} from "react";
import { cn } from "@/lib/utils";
import { Slot } from "./Slot";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
  iconOnly?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  asChild?: boolean;
  children?: React.ReactNode;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-[var(--lume-control-h-sm)] gap-[var(--lume-control-gap-sm)] text-[length:var(--lume-control-text-sm)]",
  md: "h-[var(--lume-control-h-md)] gap-[var(--lume-control-gap-md)] text-[length:var(--lume-control-text-md)]",
  lg: "h-[var(--lume-control-h-lg)] gap-[var(--lume-control-gap-lg)] text-[length:var(--lume-control-text-lg)]",
};

const sizePaddingClasses: Record<ButtonSize, string> = {
  sm: "px-[var(--lume-control-px-sm)]",
  md: "px-[var(--lume-control-px-md)]",
  lg: "px-[var(--lume-control-px-lg)]",
};

const iconOnlyClasses: Record<ButtonSize, string> = {
  sm: "w-[var(--lume-control-h-sm)] p-0 [&>svg]:size-3.5 [&>svg]:shrink-0",
  md: "w-[var(--lume-control-h-md)] p-0 [&>svg]:size-4 [&>svg]:shrink-0",
  lg: "w-[var(--lume-control-h-lg)] p-0 [&>svg]:size-5 [&>svg]:shrink-0",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: cn(
    "bg-[var(--lume-button-accent-bg)] text-[var(--lume-button-accent-fg)]",
    "hover:bg-[var(--lume-button-accent-bg-hover)] active:bg-[var(--lume-button-accent-bg-active)]",
    "hover:-translate-y-px hover:shadow-[0_8px_24px_-8px_var(--lume-accent-muted)]",
    "max-md:active:translate-y-0",
  ),
  secondary: cn(
    "bg-[var(--lume-button-secondary-bg)] text-[var(--lume-button-secondary-fg)]",
    "border border-[var(--lume-border)]",
    "hover:bg-[var(--lume-button-secondary-bg-hover)]",
  ),
  ghost: cn(
    "bg-[var(--lume-button-ghost-bg)] text-[var(--lume-button-ghost-fg)]",
    "hover:bg-[var(--lume-button-ghost-bg-hover)]",
  ),
  destructive: cn(
    "bg-[var(--lume-button-destructive-bg)] text-[var(--lume-button-destructive-fg)]",
    "hover:bg-[var(--lume-button-destructive-bg-hover)]",
    "hover:-translate-y-px",
    "max-md:active:translate-y-0",
  ),
};

const iconSize: Record<ButtonSize, string> = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    leadingIcon: LeadingIcon,
    trailingIcon: TrailingIcon,
    iconOnly = false,
    loading = false,
    fullWidth = false,
    asChild = false,
    className,
    disabled,
    children,
    type,
    "aria-label": ariaLabel,
    ...rest
  },
  ref,
) {
  if (process.env.NODE_ENV !== "production" && iconOnly && !ariaLabel) {
    console.warn("<Button iconOnly> requires an aria-label for accessibility.");
  }

  const isDisabled = disabled || loading;

  const classes = cn(
    "relative inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap",
    "transition-[background-color,border-color,color,transform,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-in-out)]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lume-ring-focus)]",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "disabled:hover:translate-y-0 disabled:hover:transform-none disabled:hover:shadow-none",
    sizeClasses[size],
    iconOnly ? iconOnlyClasses[size] : sizePaddingClasses[size],
    variantClasses[variant],
    fullWidth && "w-full",
    className,
  );

  const iconClass = iconSize[size];

  const content = loading ? (
    <>
      <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <span
          className={cn(
            iconClass,
            "animate-spin rounded-full border-2 border-current border-t-transparent",
          )}
        />
      </span>
      <span className="inline-flex items-center gap-[inherit] opacity-0">
        {LeadingIcon && <LeadingIcon className={iconClass} aria-hidden />}
        {children}
        {TrailingIcon && <TrailingIcon className={iconClass} aria-hidden />}
      </span>
    </>
  ) : (
    <>
      {LeadingIcon && <LeadingIcon className={iconClass} aria-hidden />}
      {children}
      {TrailingIcon && <TrailingIcon className={iconClass} aria-hidden />}
    </>
  );

  if (asChild) {
    return (
      <Slot className={classes} aria-label={ariaLabel} {...rest}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={classes}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
      {...rest}
    >
      {content}
    </button>
  );
});
