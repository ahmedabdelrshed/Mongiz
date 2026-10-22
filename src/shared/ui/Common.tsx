import { useId, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { motion } from "framer-motion";
import { fade } from "./Motion";
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
export function Loading({ label = "Loading workspace…" }: { label?: string }) {
  return (
    <div className="empty" role="status" aria-busy="true">
      <LoaderCircle className="spin" />
      {label}
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
