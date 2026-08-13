"use client";

import { X } from "lucide-react";
import {
  createContext,
  type ComponentProps,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
} from "react";

import { cn } from "@/lib/utils";

type DialogContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
};

const DialogContext = createContext<DialogContextValue | null>(null);

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

function Dialog({ open, onOpenChange, children }: DialogProps) {
  const reactId = useId().replace(/:/g, "");

  return (
    <DialogContext.Provider
      value={{
        open,
        onOpenChange,
        titleId: `dialog-title-${reactId}`,
        descriptionId: `dialog-description-${reactId}`,
      }}
    >
      {children}
    </DialogContext.Provider>
  );
}

function useDialogContext() {
  const context = useContext(DialogContext);

  if (!context) {
    throw new Error("Dialog components must be used within Dialog.");
  }

  return context;
}

function DialogContent({ className, children, ...props }: ComponentProps<"div">) {
  const { open, onOpenChange, titleId, descriptionId } = useDialogContext();
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const dialog = contentRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      const initialFocus =
        dialog?.querySelector<HTMLElement>("[data-dialog-initial-focus='true']") ??
        dialog?.querySelector<HTMLElement>(
          "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([data-dialog-close]), a[href], [tabindex]:not([tabindex='-1'])"
        ) ??
        dialog;

      initialFocus?.focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!dialog) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true"
      );

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === first || activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;

      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Tutup dialog"
        className="absolute inset-0 cursor-default bg-black/50"
        onClick={() => onOpenChange(false)}
      />

      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={cn(
          "relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card text-card-foreground shadow-xl outline-none",
          className
        )}
        {...props}
      >
        <button
          type="button"
          data-dialog-close
          aria-label="Tutup"
          onClick={() => onOpenChange(false)}
          className="absolute top-3 right-3 z-10 rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid gap-1.5 border-b border-border px-5 py-4 pr-12", className)} {...props} />;
}

function DialogTitle({ className, id, ...props }: ComponentProps<"h2">) {
  const { titleId } = useDialogContext();
  return <h2 id={id ?? titleId} className={cn("text-lg font-semibold", className)} {...props} />;
}

function DialogDescription({ className, id, ...props }: ComponentProps<"p">) {
  const { descriptionId } = useDialogContext();
  return <p id={id ?? descriptionId} className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function DialogBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4", className)} {...props} />;
}

export {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
};
