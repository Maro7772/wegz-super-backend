import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

export interface IFeatureOverrides {
  haveEcommerce?: boolean;
  haveMobileApp?: boolean;
  havePOS?: boolean;
  haveReports?: boolean;
  haveStockTake?: boolean;
}

export interface ISubscription extends Document {
  _id: Types.ObjectId;
  client_id: Types.ObjectId;
  package_id: Types.ObjectId;
  start_date: Date;
  end_date: Date;
  status: "active" | "expired" | "cancelled";
  feature_overrides?: IFeatureOverrides;
  createdAt: Date;
  updatedAt: Date;
}

const overridesSchema = new Schema<IFeatureOverrides>(
  {
    haveEcommerce: Boolean,
    haveMobileApp: Boolean,
    havePOS: Boolean,
    haveReports: Boolean,
    haveStockTake: Boolean,
  },
  { _id: false },
);

const schema = new Schema<ISubscription>(
  {
    client_id: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
    package_id: { type: Schema.Types.ObjectId, ref: "Package", required: true },
    start_date: { type: Date, required: true, default: Date.now },
    end_date: { type: Date, required: true },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled"],
      default: "active",
      index: true,
    },
    feature_overrides: { type: overridesSchema },
  },
  { timestamps: true },
);

export const SubscriptionModel = mongoose.model<ISubscription>(
  "Subscription",
  schema,
);
