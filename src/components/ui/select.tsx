"use client";

import { Check, ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = {
  value: string;
  onValueChange: (nextValue: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  triggerId?: string;
  children?: ReactNode;
};

function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  contentClassName,
  triggerId,
  children,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [openDirection, setOpenDirection] = useState<"up" | "down">("down");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const selectedOption = useMemo(() => options.find((option) => option.value === value), [options, value]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const label = selectedOption?.label ?? placeholder ?? "Pilih...";

  const calculateOpenDirection = () => {
    if (!triggerRef.current) {
      setOpenDirection("down");
      return;
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const estimatedMenuHeight = Math.min(240, options.length * 34 + 8);

    if (spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow) {
      setOpenDirection("up");
      return;
    }

    setOpenDirection("down");
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        data-slot="select-trigger"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => {
            const nextOpen = !prev;

            if (nextOpen) {
              calculateOpenDirection();
            }

            return nextOpen;
          });
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "border-input bg-background h-8 w-full rounded-lg border px-3 pr-9 text-left text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        <span className={cn("block truncate", !selectedOption ? "text-muted-foreground" : "text-foreground")}>{label}</span>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
      </button>

      {open ? (
        <div
          role="listbox"
          className={cn(
            "scrollbar-AR absolute z-50 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md",
            openDirection === "up" ? "bottom-full mb-1" : "top-full mt-1",
            contentClassName
          )}
        >
          {options.map((option) => {
            const active = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition",
                  active ? "bg-primary/15 text-primary" : "hover:bg-muted"
                )}
              >
                <span>{option.label}</span>
                {active ? <Check className="size-4" /> : null}
              </button>
            );
          })}
          {children}
        </div>
      ) : null}
    </div>
  );
}

export { Select };
