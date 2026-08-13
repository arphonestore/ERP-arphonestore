
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Konfirmasi",
  cancelText = "Batal",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    if (confirming) return;

    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !confirming && onOpenChange(nextOpen)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogBody className="pt-0" />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>
            {cancelText}
          </Button>
          <Button
            type="button"
            data-dialog-initial-focus="true"
            variant={destructive ? "destructive" : "default"}
            onClick={() => void handleConfirm()}
            disabled={confirming}
          >
            {confirming ? "Memproses..." : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
