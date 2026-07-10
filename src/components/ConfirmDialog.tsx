"use client";

import { AppIcon } from "./design-system";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

type ConfirmDialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  description: string;
  open: boolean;
  title: string;
  tone?: "danger" | "default";
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function ConfirmDialog({
  cancelLabel = "Cancelar",
  confirmLabel = "Confirmar",
  description,
  open,
  title,
  tone = "default",
  onConfirm,
  onOpenChange
}: ConfirmDialogProps) {
  const isDanger = tone === "danger";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <AppIcon className={isDanger ? "bg-rose-50 text-rose-600" : "bg-primary/10 text-primary"} name={isDanger ? "alert" : "check"} />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            className={isDanger ? "bg-rose-600 text-white hover:bg-rose-700" : undefined}
            type="button"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
