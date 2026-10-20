import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { env } from "../config/env";

export const PAYMENT_STATUSES = ["pending", "approve", "reject"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "card",
  "wallet",
  "cheque",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Payment = تحصيل مبلغ من عميل (اشتراك / تجديد / Sale).
 * نفس أسماء الحالات المستخدمة في SuperBackSystego (pending | approve | reject)
 * عشان الواجهات والـ tenant backend يفضلوا متوافقين.
 */
export interface IPayment extends Document {
  _id: Types.ObjectId;
  reference: string;
  client_id: Types.ObjectId;
  sale_id?: Types.ObjectId;
  amount: number;
  currency: string;
  date: Date;
  status: PaymentStatus;
  method: PaymentMethod;
  payment_cycle: string;
  screenshot?: string;
  notes?: string;
  rejection_reason?: string;
  reviewed_by?: Types.ObjectId;
  reviewed_at?: Date;
  created_by?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPayment>(
  {
    reference: { type: String, unique: true, index: true },
    client_id: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
    sale_id: { type: Schema.Types.ObjectId, ref: "Sale", index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: env.CURRENCY, uppercase: true },
    date: { type: Date, default: Date.now, index: true },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "pending",
      index: true,
    },
    method: {
      type: String,
      enum: PAYMENT_METHODS,
      default: "bank_transfer",
    },
    payment_cycle: { type: String, default: "monthly" },
    screenshot: { type: String },
    notes: { type: String, trim: true },
    rejection_reason: { type: String, trim: true },
    reviewed_by: { type: Schema.Types.ObjectId, ref: "SuperAdmin" },
    reviewed_at: { type: Date },
    created_by: { type: Schema.Types.ObjectId, ref: "SuperAdmin" },
  },
  { timestamps: true },
);

schema.pre("validate", function (next) {
  if (!this.reference) {
    this.reference = `${env.INVOICE_PREFIX}-${Date.now().toString(36).toUpperCase()}-${Math.floor(
      Math.random() * 900 + 100,
    )}`;
  }
});

export const PaymentModel = mongoose.model<IPayment>("Payment", schema);
