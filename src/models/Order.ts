import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

export const ORDER_STATUSES = ["pending", "approve", "reject"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface IOrder extends Document {
  _id: Types.ObjectId;
  package_id: Types.ObjectId;
  price: number;
  discount: number;
  final_price: number;
  status: OrderStatus;
  payment_method_id: Types.ObjectId;
  reject_reason?: string | null;
  receipt?: string;
  client_id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    package_id: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
      index: true,
    },
    price: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    final_price: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "pending",
      index: true,
    },
    payment_method_id: {
      type: Schema.Types.ObjectId,
      ref: "PaymentMethod",
      required: true,
      index: true,
    },
    reject_reason: { type: String, default: null, trim: true },
    receipt: { type: String, trim: true },
    client_id: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
  },
  { timestamps: true, collection: "orders" },
);

export const OrderModel = mongoose.model<IOrder>("Order", orderSchema);
