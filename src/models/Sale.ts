import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { env } from "../config/env";

export const BILLING_CYCLES = [
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
  "custom",
] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const SALE_STATUSES = [
  "pending",
  "paid",
  "cancelled",
  "refunded",
] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

/**
 * Sale = عملية بيع / اتفاق مع عميل (Deal).
 * الـ Payment هو التحصيل الفعلي للـ Sale.
 */
export interface ISale extends Document {
  _id: Types.ObjectId;
  sale_no: string;
  client_id: Types.ObjectId;
  amount: number;
  discount: number;
  total: number;
  currency: string;
  cycle: BillingCycle;
  sale_date: Date;
  status: SaleStatus;
  sales_agent_id?: Types.ObjectId;
  sales_agent_name?: string;
  sales_agent_phone?: string;
  notes?: string;
  created_by?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ISale>(
  {
    sale_no: { type: String, unique: true, index: true },
    client_id: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: env.CURRENCY, uppercase: true },
    cycle: { type: String, enum: BILLING_CYCLES, default: "monthly" },
    sale_date: { type: Date, default: Date.now, index: true },
    status: {
      type: String,
      enum: SALE_STATUSES,
      default: "pending",
      index: true,
    },
    sales_agent_id: { type: Schema.Types.ObjectId, ref: "SuperAdmin", index: true },
    sales_agent_name: { type: String, trim: true },
    sales_agent_phone: { type: String, trim: true },
    notes: { type: String, trim: true },
    created_by: { type: Schema.Types.ObjectId, ref: "SuperAdmin" },
  },
  { timestamps: true },
);

schema.pre("validate", async function () {
  if (!this.sale_no) {
    this.sale_no = `SAL-${Date.now().toString(36).toUpperCase()}-${Math.floor(
      Math.random() * 900 + 100,
    )}`;
  }
});

schema.pre("save", async function () {
  this.total = Math.max(0, (this.amount ?? 0) - (this.discount ?? 0));
});

export const SaleModel = mongoose.model<ISale>("Sale", schema);
