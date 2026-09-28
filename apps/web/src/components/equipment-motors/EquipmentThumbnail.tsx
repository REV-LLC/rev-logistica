"use client";
import { useState } from "react";
import { IconEngine } from "@tabler/icons-react";
import AppImage from "@/components/AppImage";
import { equipmentImage, type EquipmentIdentity } from "./types";
import classes from "./EquipmentCompatibilitySelect.module.css";

/** Fixed footprint; public images use Next's small cached variants, private URLs retain AppImage's policy. */
export default function EquipmentThumbnail({
  equipment,
}: {
  equipment: EquipmentIdentity;
}) {
  const src = equipmentImage(equipment);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <span
      className={classes.thumbnail}
      aria-hidden="true"
      data-equipment-thumbnail
    >
      {src && src !== failedSource ? (
        <AppImage
          key={src}
          src={src}
          alt=""
          width={32}
          height={32}
          sizes="32px"
          loading="lazy"
          decoding="async"
          className={classes.image}
          style={{ width: 32, height: 32 }}
          onError={() => setFailedSource(src)}
        />
      ) : (
        <IconEngine size={18} stroke={1.5} />
      )}
    </span>
  );
}
