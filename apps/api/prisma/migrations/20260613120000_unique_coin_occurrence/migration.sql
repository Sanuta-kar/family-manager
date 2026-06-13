-- Prevent duplicate completion coin awards for the same mission occurrence.
CREATE UNIQUE INDEX "CoinLedger_occurrenceId_key" ON "CoinLedger"("occurrenceId");
