import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

export const PACKAGE_STATUSES = ["active", "inactive"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export interface IPackage extends Document {
  _id: Types.ObjectId;
  name: string;
  price: number;
  months: number;
  status: PackageStatus;
  discount: number;
  createdAt: Date;
  updatedAt: Date;
}

const packageSchema = new Schema<IPackage>(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    months: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: PACKAGE_STATUSES,
      default: "active",
      index: true,
    },
    discount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: "packages" },
);

export const PackageModel = mongoose.model<IPackage>("Package", packageSchema);
