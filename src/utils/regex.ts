/**
 * يهرّب أي حروف خاصة في الـ Regex قبل ما نحط قيمة جاية من المستخدم
 * جوه `new RegExp(...)`. من غير كده البحث بـ "(" أو "*" بيرمي
 * SyntaxError ويطلّع 500 بدل نتيجة بحث عادية.
 */
export function escapeRegex(value: unknown): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
