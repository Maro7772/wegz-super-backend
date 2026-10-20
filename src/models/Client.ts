import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import bcrypt from "bcrypt";

export type ProvisioningStatus =
  | "pending"
  | "creating_db"
  | "creating_subdomain"
  | "deploying"
  | "generating_key"
  | "installing_ssl"
  | "completed"
  | "failed";

export type ClientStatus = "active" | "suspended" | "pending";

export const OPERATION_STATUSES = [
  "demo",
  "sales",
  "data",
  "delivered",
] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export const PAYMENT_CYCLES = [
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
] as const;
export type PaymentCycle = (typeof PAYMENT_CYCLES)[number];

export interface IClientNote {
  text: string;
  created_at: Date;
  created_by?: Types.ObjectId;
}

export interface IClient extends Document {
  _id: Types.ObjectId;
  company_name: string;
  email: string;
  password: string;
  subdomain: string;
  subdomain_url?: string;
  backend_url?: string;
  db_name?: string;
  status: ClientStatus;
  logoBase64?: string;

  // ---- تصنيف العميل ----
  category_id?: Types.ObjectId;
  subcategory_id?: Types.ObjectId;

  // ---- المبيعات ----
  sales_agent_id?: Types.ObjectId;
  sales_man_name?: string;
  sales_man_phone?: string;
  operation_status?: OperationStatus;

  // ---- المالية ----
  payment_cycle?: PaymentCycle;
  payment_amount?: number;
  last_payment_date?: Date;

  notes?: IClientNote[];

  provisioning_status: ProvisioningStatus;
  provisioning_error?: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(plain: string): Promise<boolean>;
}

const noteSchema = new Schema<IClientNote>(
  {
    text: { type: String, required: true, trim: true },
    created_at: { type: Date, default: Date.now },
    created_by: { type: Schema.Types.ObjectId, ref: "SuperAdmin" },
  },
  { _id: false },
);

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
    logoBase64: String,

    // ---- التصنيف ----
    category_id: { type: Schema.Types.ObjectId, ref: "Category", index: true },
    subcategory_id: { type: Schema.Types.ObjectId, ref: "Category", index: true },

    // ---- المبيعات ----
    sales_agent_id: {
      type: Schema.Types.ObjectId,
      ref: "SuperAdmin",
      index: true,
    },
    sales_man_name: { type: String, trim: true },
    sales_man_phone: { type: String, trim: true },
    operation_status: {
      type: String,
      enum: OPERATION_STATUSES,
      default: "sales",
      index: true,
    },

    // ---- المالية ----
    payment_cycle: { type: String, enum: PAYMENT_CYCLES },
    payment_amount: { type: Number, default: 0 },
    last_payment_date: { type: Date },

    notes: { type: [noteSchema], default: [] },
    provisioning_status: {
      type: String,
      enum: [
        "pending",
        "creating_db",
        "creating_subdomain",
        "deploying",
        "generating_key",
        "installing_ssl",
        "completed",
        "failed",
      ],
      default: "pending",
    },
    provisioning_error: String,
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
