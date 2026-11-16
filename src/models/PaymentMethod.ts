import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

export const PAYMENT_METHOD_STATUSES = ["active", "inactive"] as const;
export type PaymentMethodStatus = (typeof PAYMENT_METHOD_STATUSES)[number];

export interface IPaymentMethod extends Document {
  _id: Types.ObjectId;
  name: string;
  icon?: string;
  description?: string;
  status: PaymentMethodStatus;
  createdAt: Date;
  updatedAt: Date;
}

const paymentMethodSchema = new Schema<IPaymentMethod>(
  {
    name: { type: String, required: true, trim: true },
    icon: { type: String, trim: true },
    description: { type: String, trim: true },
    status: {
      type: String,
      enum: PAYMENT_METHOD_STATUSES,
      default: "active",
      index: true,
    },
  },
  { timestamps: true, collection: "payment_methods" },
);

export const PaymentMethodModel = mongoose.model<IPaymentMethod>(
  "PaymentMethod",
  paymentMethodSchema,
);
