import { useId, type ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { fade } from "./Motion";
import { MongizMark } from "./MongizMark";
export function Notice({
  children,
  tone = "info",
  compact = false,
  label = "More information",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success";
  /** Shows the message in a small, hover/focus-revealed hint. */
  compact?: boolean;
  label?: string;
}) {
  const descriptionId = useId();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={fade}
      className={`notice ${tone}${compact ? " compact" : ""}`}
      role={tone === "error" ? "alert" : "status"}
      tabIndex={compact ? 0 : undefined}
      aria-label={compact ? label : undefined}
      aria-describedby={compact ? descriptionId : undefined}
    >
      {tone === "success" ? (
        <CheckCircle2 size={17} />
      ) : (
        <AlertCircle size={17} />
      )}
      <div
        id={compact ? descriptionId : undefined}
        className={compact ? "notice-tooltip" : undefined}
      >
        {children}
      </div>
    </motion.div>
  );
}
export function BusyIndicator() {
  return (
    <span className="busy-indicator" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
export function Loading({
  label = "Loading workspace…",
  description,
}: {
  label?: string;
  description?: string;
}) {
  return (
    <div
      className="loading-state"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="loading-visual" aria-hidden="true">
        <span className="loading-orbit" />
        <MongizMark className="loading-mark" />
      </div>
      <div className="loading-copy">
        <strong>{label}</strong>
        {description && <p>{description}</p>}
        <div className="loading-lines" aria-hidden="true">
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
