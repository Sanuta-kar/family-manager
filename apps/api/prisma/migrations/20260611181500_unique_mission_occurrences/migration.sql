-- CreateIndex
CREATE UNIQUE INDEX "MissionOccurrence_templateId_scheduledFor_key" ON "MissionOccurrence"("templateId", "scheduledFor");
