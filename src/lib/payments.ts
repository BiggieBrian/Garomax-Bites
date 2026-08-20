import type { Order } from '../types';

export interface OrderBreakdown {
  cash: number;
  mpesa: number;
  /** Still owed on this order right now (only nonzero while payment_status === 'credit'). */
  creditOutstanding: number;
  /** Written off as a loss (only nonzero while payment_status === 'unpaid_loss'). */
  lossAmount: number;
}

/**
 * How much of this order landed in each collection method. Works for both:
 *  - legacy single-method orders (payment_method: 'cash' | 'mpesa' | 'credit',
 *    no payment_splits) — the whole total_amount goes to that one bucket.
 *  - split orders (payment_method: 'split', payment_splits: {...}) — e.g. a
 *    customer paying 50 cash / 100 mpesa / 30 credit on one bill.
 *
 * Importantly, a split order's cash/mpesa portions count as collected the
 * moment the waiter closes the ticket, even while payment_status is still
 * 'credit' because part of the same bill remains outstanding. That's what
 * keeps cash-drawer reconciliation accurate for partially-credit tickets.
 */
export function getOrderBreakdown(order: Order): OrderBreakdown {
  const splits = order.payment_splits;

  if (splits) {
    const cash = splits.cash ?? 0;
    const mpesa = splits.mpesa ?? 0;
    const remaining = splits.credit ?? 0;
    if (order.payment_status === 'credit') {
      return { cash, mpesa, creditOutstanding: remaining, lossAmount: 0 };
    }
    if (order.payment_status === 'unpaid_loss') {
      // Whatever was actually collected (cash/mpesa) stays collected —
      // only the portion that was still outstanding is the real loss.
      return { cash, mpesa, creditOutstanding: 0, lossAmount: remaining };
    }
    // 'paid' — any credit portion has already been folded into cash/mpesa
    // by AdminDashboard's handleCollectCredit, so nothing to report here.
    return { cash, mpesa, creditOutstanding: 0, lossAmount: 0 };
  }

  // Legacy path — no payment_splits recorded, single method for the whole order.
  if (order.payment_status === 'paid') {
    return {
      cash: order.payment_method === 'cash' ? order.total_amount : 0,
      mpesa: order.payment_method === 'mpesa' ? order.total_amount : 0,
      creditOutstanding: 0,
      lossAmount: 0,
    };
  }
  if (order.payment_status === 'credit') {
    return { cash: 0, mpesa: 0, creditOutstanding: order.total_amount, lossAmount: 0 };
  }
  if (order.payment_status === 'unpaid_loss') {
    return { cash: 0, mpesa: 0, creditOutstanding: 0, lossAmount: order.total_amount };
  }
  return { cash: 0, mpesa: 0, creditOutstanding: 0, lossAmount: 0 };
}

/**
 * Fold an outstanding credit balance into whichever method the owner just
 * collected it by. Used by AdminDashboard's Credit/Tabs "Paid Cash" / "Paid
 * M-Pesa" buttons — merges into any cash/mpesa this order already collected
 * up front, so a partially-split ticket ends with an accurate full record.
 */
export function collectOutstandingCredit(order: Order, method: 'cash' | 'mpesa') {
  const existing = order.payment_splits ?? { credit: order.total_amount };
  const outstanding = existing.credit ?? 0;
  const newSplits = {
    cash: (existing.cash ?? 0) + (method === 'cash' ? outstanding : 0),
    mpesa: (existing.mpesa ?? 0) + (method === 'mpesa' ? outstanding : 0),
    credit: 0,
  };
  return { payment_status: 'paid' as const, payment_method: 'split' as const, payment_splits: newSplits };
}