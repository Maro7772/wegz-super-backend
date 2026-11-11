/**
 * Subscription Date Calculator Utility
 *
 * يحسب فترات الاشتراك بدقة مع معالجة فروق عدد أيام الشهور (كفبراير ونهايات الشهور 30/31).
 */

export function addMonthsSafe(baseDate: Date, monthsToAdd: number): Date {
  const result = new Date(baseDate.getTime());
  const currentDay = result.getDate();

  result.setMonth(result.getMonth() + monthsToAdd);

  // إذا حدث تجاوز للشهر التالي (مثل 31 يناير + شهر -> أصبح في مارس بدلاً من نهاية فبراير)
  if (result.getDate() !== currentDay) {
    result.setDate(0); // يضبط التاريخ على آخر يوم في الشهر المستهدف
  }

  return result;
}

/**
 * حساب تاريخ الانتهاء بناءً على دورة الدفع
 */
export function calculateEndDate(
  startDate: Date,
  paymentCycle?: string | null,
): Date {
  switch (paymentCycle) {
    case "quarterly":
      return addMonthsSafe(startDate, 3);
    case "half_yearly":
      return addMonthsSafe(startDate, 6);
    case "yearly":
      return addMonthsSafe(startDate, 12);
    case "monthly":
    default:
      return addMonthsSafe(startDate, 1);
  }
}

/**
 * التحقق مما إذا كان التاريخ الحالي يقع ضمن فترة الاشتراك
 */
export function isSubscriptionActive(
  startDate?: Date | null,
  endDate?: Date | null,
): boolean {
  if (!startDate || !endDate) return false;
  const now = new Date();
  return now >= new Date(startDate) && now <= new Date(endDate);
}

/**
 * حساب الأيام المتبقية في الاشتراك
 */
export function getDaysRemaining(endDate?: Date | null): number {
  if (!endDate) return 0;
  const now = new Date().getTime();
  const end = new Date(endDate).getTime();
  const diff = end - now;
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
