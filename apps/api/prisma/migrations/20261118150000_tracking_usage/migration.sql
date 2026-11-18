CREATE TABLE "TrackingUsage" (
    "key" VARCHAR(64) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrackingUsage_pkey" PRIMARY KEY ("key")
);
