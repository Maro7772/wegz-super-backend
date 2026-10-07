import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  admin_id?: Types.ObjectId;
  action: string;
  target_type?: string;
  target_id?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

const schema = new Schema<IAuditLog>(
  {
    admin_id: { type: Schema.Types.ObjectId, ref: "SuperAdmin", index: true },
    action: { type: String, required: true, index: true },
    target_type: String,
    target_id: { type: Schema.Types.ObjectId, index: true },
    metadata: Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const AuditLogModel = mongoose.model<IAuditLog>("AuditLog", schema);
