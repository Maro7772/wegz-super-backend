import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

export interface ITenantApiKey extends Document {
  _id: Types.ObjectId;
  client_id: Types.ObjectId;
  hashedKey: string;
  label: string;
  active: boolean;
  last_used_at?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ITenantApiKey>(
  {
    client_id: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
    hashedKey: { type: String, required: true, unique: true, index: true },
    label: { type: String, default: "default" },
    active: { type: Boolean, default: true, index: true },
    last_used_at: Date,
  },
  { timestamps: true },
);

export const TenantApiKeyModel = mongoose.model<ITenantApiKey>(
  "TenantApiKey",
  schema,
);
