import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

export type ToastTone = "default" | "success" | "danger";

type ToastProps = {
  message: string | null;
  tone?: ToastTone;
};

export function Toast({ message, tone = "default" }: ToastProps) {
  return createPortal(
    <AnimatePresence>
      {message ? (
        <motion.div
          className={`toast toast-${tone}`}
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
        >
          <span className="toast-dot" />
          {message}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
