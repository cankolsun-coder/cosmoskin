ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE IF EXISTS orders
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'pending_payment',
    'pending_bank_transfer',
    'paid',
    'preparing',
    'shipped',
    'delivered',
    'cancelled',
    'payment_failed',
    'refunded',
    'partially_refunded'
  ));

ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE IF EXISTS orders
  ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN (
    'pending',
    'initiated',
    'awaiting_transfer',
    'paid',
    'failed',
    'refunded',
    'partially_refunded'
  ));

ALTER TABLE IF EXISTS payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE IF EXISTS payments
  ADD CONSTRAINT payments_status_check CHECK (status IN (
    'initiated',
    'awaiting_transfer',
    'paid',
    'failed',
    'initialize_failed',
    'refunded',
    'partially_refunded'
  ));
