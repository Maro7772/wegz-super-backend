import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import bcrypt from "bcrypt";

export type ProvisioningStatus =
  | "pending"
  | "creating_db"
  | "creating_subdomain"
  | "deploying"
  | "generating_key"
  | "creating_subscription"
  | "installing_ssl"
  | "completed"
  | "failed";

export interface IClient extends Document {
  _id: Types.ObjectId;
  company_name: string;
  email: string;
  password: string;
  subdomain: string;
  subdomain_url?: string;
  backend_url?: string;
  db_name?: string;
  status: "active" | "suspended" | "pending";
  package_id: Types.ObjectId;
  logoBase64?: string;
  provisioning_status: ProvisioningStatus;
  provisioning_error?: string;

  // ✅ الحقول الجديدة لمراقبة الـ provisioning
  provisioning_started_at?: Date;
  provisioning_updated_at?: Date;
  provisioning_step_details?: Map<string, string[]>;

  createdAt: Date;
  updatedAt: Date;
  comparePassword(plain: string): Promise<boolean>;
}

const schema = new Schema<IClient>(
  {
    company_name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    subdomain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    subdomain_url: String,
    backend_url: String,
    db_name: String,
    status: {
      type: String,
      enum: ["active", "suspended", "pending"],
      default: "pending",
    },
    package_id: { type: Schema.Types.ObjectId, ref: "Package", required: true },
    logoBase64: String,
    provisioning_status: {
      type: String,
      enum: [
        "pending",
        "creating_db",
        "creating_subdomain",
        "deploying",
        "generating_key",
        "creating_subscription",
        "installing_ssl",
        "completed",
        "failed",
      ],
      default: "pending",
    },
    provisioning_error: String,

    // ✅ حقول المراقبة
    provisioning_started_at: Date,
    provisioning_updated_at: Date,
    provisioning_step_details: {
      type: Map,
      of: [String],
      default: {},
    },
  },
  { timestamps: true },
);

schema.pre("save", async function (next) {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

schema.methods.comparePassword = function (plain: string) {
  return bcrypt.compare(plain, this.password);
};

export const ClientModel = mongoose.model<IClient>("Client", schema);
