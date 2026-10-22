import { forwardRef, useEffect, useId, useState, type ReactNode } from "react";
import {
  motion,
  useIsPresent,
  useReducedMotion,
  type HTMLMotionProps,
} from "framer-motion";
import { ChevronDown } from "lucide-react";

export const fade = { duration: 0.16, ease: "easeOut" as const };

export const AnimatedSection = forwardRef<
  HTMLElement,
  HTMLMotionProps<"section">
>(function AnimatedSection(props, ref) {
  const present = useIsPresent();
  return (
    <motion.section
      {...props}
      ref={ref}
      aria-hidden={present ? undefined : true}
      inert={!present}
    />
  );
});

export function PageEntry({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={fade}
    >
      {children}
    </motion.div>
  );
}

/** Keep form state mounted, but remove collapsed content from focus and accessibility. */
export function Reveal({
  open,
  children,
  id,
  onAnimationComplete,
}: {
  open: boolean;
  children: ReactNode;
  id?: string;
  onAnimationComplete?: () => void;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      id={id}
      className="reveal"
      initial={false}
      animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
      transition={{ duration: reduced ? 0 : 0.2, ease: "easeOut" }}
      onAnimationComplete={onAnimationComplete}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="reveal-content">{children}</div>
    </motion.div>
  );
}

export function Disclosure({
  title,
  children,
  defaultOpen = false,
  open: controlled,
  onOpenChange,
  className = "",
  summary,
  label,
  onAnimationComplete,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  summary?: ReactNode;
  label?: string;
  onAnimationComplete?: () => void;
}) {
  const [localOpen, setOpen] = useState(defaultOpen);
  const open = controlled ?? localOpen;
  const id = useId();
  return (
    <div className={`disclosure ${className}`}>
      <button
        type="button"
        className="disclosure-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
          onOpenChange?.(!open);
        }}
      >
        <ChevronDown
          size={16}
          className={open ? "chevron expanded" : "chevron"}
          aria-hidden="true"
        />
        <span>{title}</span>
        {summary && <span className="disclosure-summary">{summary}</span>}
      </button>
      <Reveal open={open} id={id} onAnimationComplete={onAnimationComplete}>
        {children}
      </Reveal>
    </div>
  );
}

export function useCompactLayout() {
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 1023px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}
