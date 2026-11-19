"use client";

import { useEffect, useState } from "react";
import { Text } from "@mantine/core";
import { apiBlob } from "@/lib/api";

export default function AttendancePrivatePhoto({
  path,
  alt,
}: {
  path: string;
  alt: string;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false,
      objectUrl = "";
    setError(false);
    setUrl("");
    void apiBlob(path, { cache: "no-store" })
      .then((blob) => {
        if (!cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return url ? (
    <img
      src={url}
      alt={alt}
      style={{
        maxWidth: "100%",
        maxHeight: 340,
        borderRadius: 8,
        objectFit: "contain",
      }}
    />
  ) : (
    <Text c="dimmed">{error ? "Foto no disponible" : "Cargando foto…"}</Text>
  );
}
