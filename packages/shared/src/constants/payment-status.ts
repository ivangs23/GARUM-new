export const PAYMENT_STATUSES = ["pending", "paid", "cancelled"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
