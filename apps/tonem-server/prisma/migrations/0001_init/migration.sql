-- CreateTable
CREATE TABLE "Tick" (
    "id" BIGSERIAL NOT NULL,
    "instrument" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "meta" JSONB,

    CONSTRAINT "Tick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tick_instrument_ts_key" ON "Tick"("instrument", "ts");

-- CreateIndex
CREATE INDEX "Tick_instrument_ts_idx" ON "Tick"("instrument", "ts");
