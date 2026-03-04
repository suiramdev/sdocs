import { useMemo } from "react";

export const usePageReadQuery = (): string =>
  useMemo(() => {
    const pageUrl = typeof window === "undefined" ? "loading" : window.location.href;
    return `Read ${pageUrl}, I want to ask questions about it.`;
  }, []);
