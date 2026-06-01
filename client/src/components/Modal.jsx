import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from './ui/dialog';

/**
 * Thin wrapper around shadcn <Dialog> that preserves the legacy API
 * (isOpen / onClose / title / children / footer) so existing callers
 * keep working unchanged.
 *
 * - Escape key + overlay click + built-in X all trigger onClose
 * - sm:max-w-lg matches the previous 540px content cap
 * - max-h with internal scroll keeps long forms usable on mobile
 */
export default function Modal({ isOpen, onClose, title, children, footer }) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        {title && (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        )}
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
