import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { AnimatedSection, fade } from "./Motion";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
  kind = "dialog",
  closeLabel = "Close dialog",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  trigger?: ReactNode;
  kind?: "dialog" | "panel" | "navigation";
  closeLabel?: string;
}) {
  const reduced = useReducedMotion();
  const restoreFocus = useRef(document.activeElement as HTMLElement | null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <AnimatePresence propagate>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay forceMount asChild>
              <motion.div
                className="dialog-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={fade}
              />
            </Dialog.Overlay>
            <Dialog.Content
              forceMount
              asChild
              onCloseAutoFocus={
                trigger
                  ? undefined
                  : (event) => {
                      event.preventDefault();
                      const target = restoreFocus.current;
                      if (target?.isConnected && !target.closest("[inert]"))
                        target.focus();
                      else
                        document
                          .querySelector<HTMLInputElement>(
                            '[aria-label="Search work"]',
                          )
                          ?.focus();
                    }
              }
            >
              <AnimatedSection
                className={`modal modal-${kind}`}
                initial={{
                  opacity: 0,
                  x:
                    reduced || kind === "dialog"
                      ? 0
                      : kind === "navigation"
                        ? -20
                        : 20,
                }}
                animate={{ opacity: 1, x: 0 }}
                exit={{
                  opacity: 0,
                  x:
                    reduced || kind === "dialog"
                      ? 0
                      : kind === "navigation"
                        ? -20
                        : 20,
                }}
                transition={{ duration: reduced ? 0.1 : 0.2 }}
              >
                <div className="dialog-heading">
                  <div>
                    <Dialog.Title>{title}</Dialog.Title>
                    <Dialog.Description
                      className={description ? "muted" : "sr-only"}
                    >
                      {description ?? title}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      className="icon"
                      type="button"
                      aria-label={closeLabel}
                    >
                      <X size={18} />
                    </button>
                  </Dialog.Close>
                </div>
                <div className="dialog-body">{children}</div>
              </AnimatedSection>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

export function ConfirmButton({
  children,
  title,
  description,
  onConfirm,
  confirmLabel = "Confirm",
  className,
  disabled = false,
  label,
}: {
  children: ReactNode;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={description}
      trigger={
        <button
          type="button"
          className={className}
          disabled={disabled}
          aria-label={label}
        >
          {children}
        </button>
      }
    >
      <div className="dialog-actions">
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={disabled}
          onClick={() => {
            setOpen(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
