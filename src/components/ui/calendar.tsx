"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DropdownProps } from "react-day-picker";

import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type CalendarProps = React.ComponentProps<typeof DayPicker>;

function CalendarDropdown({ value, onChange, options, disabled }: DropdownProps) {
  const normalizedValue = String(value ?? "");
  const mappedOptions = (options ?? []).map((option) => ({
    value: String(option.value),
    label: option.label,
  }));

  return (
    <Select
      value={normalizedValue}
      onValueChange={(nextValue) => {
        onChange?.({ target: { value: nextValue } } as React.ChangeEvent<HTMLSelectElement>);
      }}
      options={mappedOptions}
      disabled={disabled}
      className="w-27.5"
    />
  );
}

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const isDropdownLayout = String(props.captionLayout ?? "").includes("dropdown");

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: "w-fit border rounded-md bg-popover p-3",
        months: "flex flex-col ",
        month: "space-y-4",
        caption: "relative flex h-8 items-center justify-center",
        caption_label: cn("text-sm font-medium", isDropdownLayout && "hidden"),
        nav: "absolute inset-x-0 top-0 flex h-16 items-center justify-between px-3",
        dropdowns: cn("flex h-8 items-center gap-2", isDropdownLayout && "mx-10 justify-center"),
        dropdown_root: "relative min-w-24",
        dropdown: "border-input bg-background rounded-sm border px-2 py-1 text-sm outline-none",
        button_previous: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "size-8 rounded-md border-border bg-background hover:bg-muted"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "size-8 rounded-md border-border bg-background hover:bg-muted"
        ),
        month_grid: "mx-auto border-collapse space-y-1",
        weekdays: "flex justify-center",
        weekday: "text-muted-foreground w-9 text-[0.8rem] font-normal",
        week: "mt-2 flex w-full justify-center",
        day: "h-9 w-9 p-0 text-center text-sm",
        day_button: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "h-9 w-9 rounded-full p-0 font-normal aria-selected:opacity-100"
        ),
        selected:
          "bg-primary text-primary-foreground rounded-full hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        range_start:
          "bg-muted/70 rounded-l-full [&>button]:rounded-full [&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary",
        range_middle:
          "bg-muted/70 text-foreground [&>button]:bg-transparent [&>button]:text-foreground [&>button:hover]:bg-transparent [&>button:hover]:text-foreground",
        range_end:
          "bg-muted/70 rounded-r-full [&>button]:rounded-full [&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary",
        today: "bg-muted text-foreground",
        outside: "text-muted-foreground opacity-40",
        disabled: "text-muted-foreground opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Dropdown: CalendarDropdown,
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("size-4", chevronClassName)} {...chevronProps} />
          ) : (
            <ChevronRight className={cn("size-4", chevronClassName)} {...chevronProps} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
