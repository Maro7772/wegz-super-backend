import type { Types } from "mongoose";
import { AuditLogModel } from "../models/AuditLog";

interface AuditParams {
  adminId?: string | Types.ObjectId;
  action: string;
  targetType?: string;
  targetId?: string | Types.ObjectId;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/**
 * يسجّل حدث في الـ Audit Log بدون ما يوقف العملية لو حصل خطأ.
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await AuditLogModel.create({
      admin_id: params.adminId,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      metadata: params.metadata,
      ip: params.ip,
    });
  } catch (err) {
    // Audit errors must never break the main flow
    console.error("⚠️ Audit log failed:", err);
  }
}
