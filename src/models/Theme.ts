import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

export const AVAILABLE_MODES = ["dark", "light"] as const;
export type ModeKey = (typeof AVAILABLE_MODES)[number];

export interface ITheme extends Document {
  _id: Types.ObjectId;
  name: string;
  key: string;
  description?: string;
  preview_image?: string;
  status: "active" | "inactive";
  availableModes: ModeKey[];
  defaultMode: ModeKey;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ITheme>(
  {
    name: { type: String, required: true, trim: true },
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: { type: String, trim: true, default: "" },
    preview_image: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    availableModes: {
      type: [String],
      enum: AVAILABLE_MODES,
      default: ["dark", "light"],
    },
    defaultMode: {
      type: String,
      enum: AVAILABLE_MODES,
      default: "light",
    },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const ThemeModel = mongoose.model<ITheme>("Theme", schema);
