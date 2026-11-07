"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export const billingOverviewPath = "/billing/annexes/consolidado";
export type OverviewSite = {
  customerId: string;
  customerName: string;
  siteId: string;
  siteName: string;
  cutFrom: string;
  cutTo: string;
};
export type OverviewRow = OverviewSite & {
  from: string;
  to: string;
  through: string;
  draftId: string | null;
  invoiceNumber: string | null;
};
type Overview = {
  today: string;
  cuts: { from: string; to: string; through: string }[];
  rows: OverviewRow[];
  reviews: OverviewSite[];
};

export function useBillingOverview() {
  const [report, setReport] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [request, setRequest] = useState(0);
  const refresh = useCallback(() => setRequest((value) => value + 1), []);
  const [progress, setProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const data = await api<
          | (Overview & { state: "ready" })
          | { state: "preparing"; processed: number; total: number }
        >("/annexes/billing/overview", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (controller.signal.aborted) return;
        setError("");
        if (data.state === "preparing") {
          setProgress(data);
          timer = setTimeout(load, 3000);
        } else {
          setReport(data);
          setProgress(null);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setProgress(null);
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo cargar el consolidado.",
          );
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [request]);
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  return { report, error, refresh, progress };
}

export function overviewAnnexUrl(row: OverviewRow) {
  const params = new URLSearchParams({
    customer: row.customerId,
    worksite: row.siteId,
    from: row.from,
    to: row.draftId ? row.to : row.through,
    through: row.through,
  });
  if (row.draftId) params.set("draft", row.draftId);
  return "/billing/annexes?" + params;
}

export function shortDate(day: string) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(day + "T12:00:00Z"))
    .replace(".", "");
}
