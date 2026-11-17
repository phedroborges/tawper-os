"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { initializeHelpCenter } from "./help-center-runtime";
import styles from "./HelpCenter.module.css";

export function HelpCenter({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root.current) return;
    return initializeHelpCenter(root.current, { embedded: true });
  }, []);

  return <div ref={root} className={styles.root} data-help-center>{children}</div>;
}
