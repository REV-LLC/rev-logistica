"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ReturnAccessoryOption } from "./return-accessory-selection";

export function useReturnAccessoryOptions(customerWorksiteId: string) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<ReturnAccessoryOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () => {
        const params = new URLSearchParams({
          type: "RETURN",
          customerWorksiteId,
          page: String(page),
          search: search.trim(),
        });
        api<{ items: ReturnAccessoryOption[]; hasMore: boolean }>(
          `/accessories/document-options?${params}`,
          { signal: controller.signal },
        )
          .then((result) => {
            if (controller.signal.aborted) return;
            setItems(result.items);
            setHasMore(result.hasMore);
          })
          .catch((err: Error) => {
            if (!controller.signal.aborted) {
              setItems([]);
              setHasMore(false);
              setError(err.message);
            }
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [customerWorksiteId, search, page, revision]);
  return {
    items,
    hasMore,
    loading,
    error,
    search,
    page,
    onSearch: (value: string) => {
      if (value === search && page === 0) return;
      setLoading(true);
      setItems([]);
      setSearch(value);
      setPage(0);
    },
    onPage: (value: number) => {
      if (value === page) return;
      setLoading(true);
      setItems([]);
      setPage(value);
    },
    retry: () => setRevision((value) => value + 1),
  };
}
