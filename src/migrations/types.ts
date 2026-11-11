import type mongoose from "mongoose";

export interface TenantMigration {
  /**
   * معرف فريد للميجريشن (يفضل أن يبدأ بالتاريخ أو رقم متسلسل)
   * مثال: "20261111_001_initial_schema"
   */
  id: string;

  /**
   * اسم أو وصف مختصر للتعديل
   */
  name: string;

  /**
   * تفاصيل أو وصف التعديل
   */
  description?: string;

  /**
   * تنفيذ التعديلات الجديدة على داتابيز الـ tenant
   * @param conn اتصال قاعدة بيانات الـ tenant الفعلي (sc_<clientId>)
   * @param tenant بيانات العميل من جدول Clients في الـ Master DB
   */
  up: (conn: mongoose.Connection, tenant: any) => Promise<void>;

  /**
   * التراجع عن التعديل (اختياري)
   */
  down?: (conn: mongoose.Connection, tenant: any) => Promise<void>;
}

export interface AppliedMigrationRecord {
  id: string;
  name: string;
  appliedAt: Date;
  executionTimeMs: number;
}

export interface TenantMigrationResult {
  tenantId: string;
  subdomain: string;
  dbName: string;
  success: boolean;
  appliedCount: number;
  newMigrations: string[];
  alreadyAppliedCount: number;
  error?: string;
  executionTimeMs: number;
}
