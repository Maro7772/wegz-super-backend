import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

export interface IPackageFeatures {
  haveEcommerce: boolean;
  haveMobileApp: boolean;
  havePOS: boolean;
  haveReports: boolean;
  haveStockTake: boolean;
}

export interface IPackage extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  monthly_price: number;
  quarterly_price: number;
  half_yearly_price: number;
  yearly_price: number;
  status: boolean;
  features: IPackageFeatures;
  createdAt: Date;
  updatedAt: Date;
}

const featuresSchema = new Schema<IPackageFeatures>(
  {
    haveEcommerce: { type: Boolean, default: false },
    haveMobileApp: { type: Boolean, default: false },
    havePOS: { type: Boolean, default: false },
    haveReports: { type: Boolean, default: false },
    haveStockTake: { type: Boolean, default: false },
  },
  { _id: false },
);

const schema = new Schema<IPackage>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    monthly_price: { type: Number, default: 0 },
    quarterly_price: { type: Number, default: 0 },
    half_yearly_price: { type: Number, default: 0 },
    yearly_price: { type: Number, default: 0 },
    status: { type: Boolean, default: true },
    features: { type: featuresSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export const PackageModel = mongoose.model<IPackage>("Package", schema);
