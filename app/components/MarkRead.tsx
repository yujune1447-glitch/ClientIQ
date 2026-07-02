"use client";

import { useEffect } from "react";

export function MarkRead({ analysisId }: { analysisId: string }) {
  useEffect(() => {
    fetch("/api/analyses/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: analysisId }),
    });
  }, [analysisId]);

  return null;
}
