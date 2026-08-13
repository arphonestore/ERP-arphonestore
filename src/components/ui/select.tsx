"use client";

import { Check, ChevronDown } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

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
  const [activeIndex, setActiveIndex] = useState(-1);
  const [openDirection, setOpenDirection] = useState<"up" | "down">("down");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const generatedId = useId().replace(/:/g, "");
  const listboxId = `${triggerId ?? `select-${generatedId}`}-listbox`;

  const selectedOption = useMemo(() => options.find((option) => option.value === value), [options, value]);
  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;

    const frame = window.requestAnimationFrame(() => {
      optionRefs.current[activeIndex]?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, open]);

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

    setOpenDirection(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow ? "up" : "down");
  };

  const openMenu = (requestedIndex?: number) => {
    if (disabled || options.length === 0) return;
    calculateOpenDirection();
    setActiveIndex(requestedIndex ?? (selectedIndex >= 0 ? selectedIndex : 0));
    setOpen(true);
  };

  const selectAtIndex = (index: number) => {
    const option = options[index];
    if (!option) return;

    onValueChange(option.value);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu(selectedIndex >= 0 ? Math.min(selectedIndex + 1, options.length - 1) : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(selectedIndex >= 0 ? Math.max(selectedIndex - 1, 0) : options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) {
        selectAtIndex(activeIndex);
      } else {
        openMenu();
      }
    }
  };

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      nextIndex = (index + 1) % options.length;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nextIndex = (index - 1 + options.length) % options.length;
    } else if (event.key === "Home") {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === "End") {
      event.preventDefault();
      nextIndex = options.length - 1;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectAtIndex(index);
      return;
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    } else if (event.key === "Tab") {
      setOpen(false);
      return;
    } else {
      return;
    }

    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
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
          if (open) {
            setOpen(false);
          } else {
            openMenu();
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        className="border-input bg-background h-8 w-full rounded-lg border px-3 pr-9 text-left text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn("block truncate", !selectedOption ? "text-muted-foreground" : "text-foreground")}>{label}</span>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          className={cn(
            "scrollbar-AR absolute z-50 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md",
            openDirection === "up" ? "bottom-full mb-1" : "top-full mt-1",
            contentClassName
          )}
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            const active = index === activeIndex;

            return (
              <button
                key={option.value}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                tabIndex={active ? 0 : -1}
                aria-selected={selected}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                onClick={() => selectAtIndex(index)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "bg-primary/15 text-primary" : active ? "bg-muted" : "hover:bg-muted"
                )}
              >
                <span>{option.label}</span>
                {selected ? <Check className="size-4" /> : null}
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
