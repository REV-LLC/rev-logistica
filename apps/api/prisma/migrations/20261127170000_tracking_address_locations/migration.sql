CREATE TABLE "TrackingAddressLocation" (
  "key" TEXT NOT NULL,
  "canonicalKey" TEXT,
  "address" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "resolvedAddress" TEXT,
  "provider" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "retryAfter" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrackingAddressLocation_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "TrackingAddressLocation_status_retryAfter_idx" ON "TrackingAddressLocation"("status", "retryAfter");
