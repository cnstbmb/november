-- Binance stopped trading TONUSDT at 2026-07-07T07:11:59.314Z but its
-- ticker/price endpoint retained 1.60. Older collectors stamped that retained
-- value with the current minute. Remove only those proven synthetic rows;
-- valid pre-break Binance history and new Kraken rows remain intact.
DELETE FROM "Tick"
WHERE "instrument" = 'ton'
  AND "meta"->>'source' = 'binance'
  AND "ts" > TIMESTAMP '2026-07-07 07:11:59.314';
