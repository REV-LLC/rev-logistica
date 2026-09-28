"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { MotorRecord } from "./types";

export function useMotorOptions(equipment: boolean, reload = 0) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<MotorRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ search, page: String(page) });
      api<{ items: MotorRecord[]; hasMore: boolean }>(
        `/equipment-motors${equipment ? "/compatible-equipment" : ""}?${query}`,
        { signal: controller.signal },
      )
        .then((data) => {
          if (!controller.signal.aborted) {
            setItems((old) =>
              page === 0
                ? data.items
                : [
                    ...new Map(
                      [...old, ...data.items].map((item) => [item.id, item]),
                    ).values(),
                  ],
            );
            setHasMore(data.hasMore);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [equipment, search, page, reload]);
  return {
    items,
    search,
    hasMore,
    loading,
    error,
    next: () => setPage((p) => p + 1),
    onSearch: (value: string) => {
      setSearch(value);
      setPage(0);
    },
  };
}
