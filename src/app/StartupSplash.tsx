import { useEffect, useState, type ReactNode } from "react";
import { MongizMark } from "../shared/ui/MongizMark";

export const STARTUP_SPLASH_MS = 500;

export function StartupSplash({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), STARTUP_SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return children;

  return (
    <div className="startup-splash" role="status" aria-label="Opening Mongiz">
      <div className="startup-brand">
        <MongizMark className="startup-mark" />
        <div className="startup-name">
          Mongiz
          <span lang="ar" dir="rtl">
            منجز
          </span>
        </div>
      </div>
    </div>
  );
}
