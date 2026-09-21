CREATE TABLE "ReleaseAcknowledgement" (
  "userId" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReleaseAcknowledgement_pkey" PRIMARY KEY ("userId", "releaseId"),
  CONSTRAINT "ReleaseAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
