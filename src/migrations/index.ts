import type { TenantMigration } from "./types";
import { migration001 } from "./001_initial_schema";
import { migration002 } from "./002_add_theme_modes_and_indexes";

/**
 * سجل الميجريشنز لجميع الـ tenant schemas.
 * أضف أي ميجريشن جديد هنا في نهاية المصفوفة ليتم تطبيقه تلقائيًا على التعديلات الجديدة فقط.
 */
export const allTenantMigrations: TenantMigration[] = [
  migration001,
  migration002,
];

export * from "./types";
