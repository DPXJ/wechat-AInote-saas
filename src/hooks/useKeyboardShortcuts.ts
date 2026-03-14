"use client";

import { useEffect } from "react";

type ShortcutHandler = {
  onSearch?: () => void;
  onNewRecord?: () => void;
  onCloseModal?: () => void;
};

export function useKeyboardShortcuts(handlers: ShortcutHandler) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === "k") {
        e.preventDefault();
        handlers.onSearch?.();
        return;
      }

      if (meta && e.key === "n") {
        e.preventDefault();
        handlers.onNewRecord?.();
        return;
      }

      if (e.key === "Escape") {
        handlers.onCloseModal?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}
