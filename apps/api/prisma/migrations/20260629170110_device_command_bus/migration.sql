-- CreateTable
CREATE TABLE "DeviceCommand" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "childProfileId" TEXT NOT NULL,
    "capabilityType" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "confirmedBy" TEXT,
    "originDraftId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "dispatchedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCommandResult" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceCommandResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCapabilityGrant" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "capabilityType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceCapabilityGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceCommand_deviceId_status_idx" ON "DeviceCommand"("deviceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCommandResult_commandId_key" ON "DeviceCommandResult"("commandId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCapabilityGrant_deviceId_capabilityType_key" ON "DeviceCapabilityGrant"("deviceId", "capabilityType");

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCommandResult" ADD CONSTRAINT "DeviceCommandResult_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "DeviceCommand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCapabilityGrant" ADD CONSTRAINT "DeviceCapabilityGrant_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
