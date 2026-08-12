"use client";

import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  id?: string;
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  disabledDate?: (date: Date) => boolean;
  minYear?: number;
  maxYear?: number;
};

function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pilih tanggal",
  className,
  disabled = false,
  disabledDate,
  minYear = 2020,
  maxYear = new Date().getFullYear(),
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [openDirection, setOpenDirection] = useState<"up" | "down">("down");
  const [alignRight, setAlignRight] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const calculatePlacement = useCallback(() => {
    if (!triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 320;
    const panelWidth = panelRef.current?.offsetWidth ?? 290;
    const viewportPadding = 8;

    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;

    if (spaceBelow < panelHeight + 8 && spaceAbove > spaceBelow) {
      setOpenDirection("up");
    } else {
      setOpenDirection("down");
    }

    const wouldOverflowRight = triggerRect.left + panelWidth > window.innerWidth - viewportPadding;
    setAlignRight(wouldOverflowRight);
  }, []);

  const selectedDate = useMemo(() => {
    if (!value) {
      return undefined;
    }

    const parsed = parseISO(value);

    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }

    return parsed;
  }, [value]);

  const startMonth = useMemo(() => new Date(minYear, 0, 1), [minYear]);
  const endMonth = useMemo(() => new Date(maxYear, 11, 31), [maxYear]);

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

    const onViewportChange = () => {
      calculatePlacement();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [calculatePlacement, open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => {
          if (disabled) {
            return;
          }

          setOpen((prev) => {
            const nextOpen = !prev;

            if (nextOpen) {
              requestAnimationFrame(() => {
                calculatePlacement();
              });
            }

            return nextOpen;
          });
        }}
        disabled={disabled}
        className="border-input bg-background text-foreground flex h-10 w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={cn(!selectedDate ? "text-muted-foreground" : "")}>{selectedDate ? format(selectedDate, "dd MMMM yyyy", { locale: localeId }) : placeholder}</span>
        <CalendarIcon className="text-muted-foreground size-4" />
      </button>

      {open ? (
        <div
          ref={panelRef}
          className={cn(
            "absolute z-50 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md",
            openDirection === "down" ? "top-full mt-1" : "bottom-full mb-1",
            alignRight ? "right-0" : "left-0"
          )}
        >
          <Calendar
            mode="single"
            selected={selectedDate}
            locale={localeId}
            captionLayout="dropdown"
            className="rounded-lg border"
            startMonth={startMonth}
            endMonth={endMonth}
            disabled={disabledDate}
            onSelect={(date) => {
              if (!date) {
                onChange("");
                return;
              }

              onChange(format(date, "yyyy-MM-dd"));
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export { DatePicker };
