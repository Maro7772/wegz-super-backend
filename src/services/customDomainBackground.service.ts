import { ClientModel } from "../models/Client";
import {
  createCustomDomainWebsite,
  verifyDomainDns,
  installDomainSsl,
} from "./plesk.service";

// قائمة النطاقات التي يجري معالجتها حالياً لمنع تكرار الـ jobs
const activeJobs = new Set<string>();

/**
 * يبدأ عملية الإعداد الكاملة في الخلفية:
 * 1. إنشاء Website في Plesk (site --create) → DNS Zone تلقائية
 * 2. فحص انتشار الـ DNS (retry بـ backoff ذكي)
 * 3. إصدار شهادة SSL تلقائياً بمجرد اكتمال التوجيه
 * 4. تحديث قاعدة البيانات
 *
 * الجدول الزمني للمحاولات:
 * - كل 30 ثانية لأول 6 محاولات (3 دقائق)
 * - كل دقيقتين للمحاولات 7-15 (18 دقيقة)
 * - كل 5 دقائق حتى محاولة 60 (حوالي 4 ساعات)
 */
export function startDomainBackgroundSetup(
  clientId: string,
  domain: string,
  subdomain: string,
): void {
  const cleanDomain = domain.trim().toLowerCase();
  if (!cleanDomain || !subdomain) return;

  if (activeJobs.has(cleanDomain)) {
    console.log(`[Background] Job already active for "${cleanDomain}"`);
    return;
  }

  activeJobs.add(cleanDomain);
  console.log(
    `🚀 [Background] Started full setup for "${cleanDomain}" (subdomain: ${subdomain}, clientId: ${clientId})`,
  );

  let attempt = 0;
  const maxAttempts = 60;
  let websiteCreated = false;

  const tick = async () => {
    attempt++;
    try {
      // ── الخطوة 1: إنشاء الـ Website في Plesk (مرة واحدة) ──────────────
      if (!websiteCreated) {
        try {
          console.log(
            `📦 [Background] Creating/updating website "${cleanDomain}" -> www-root: httpdocs/dist...`,
          );
          await createCustomDomainWebsite(cleanDomain);
          websiteCreated = true;
          console.log(`✅ [Background] Website "${cleanDomain}" created successfully`);

          // تحديث الحالة في الـ DB
          await ClientModel.findByIdAndUpdate(clientId, {
            custom_domain_status: "pending_dns",
          });
        } catch (err: any) {
          // لو Website موجود بالفعل (reused)، نكمل
          if (/already\s+exists?/i.test(err.message) || /reused/i.test(err.message)) {
            websiteCreated = true;
            console.log(`♻️ [Background] Website "${cleanDomain}" already exists — continuing`);
          } else {
            console.error(
              `❌ [Background] Website creation failed for "${cleanDomain}":`,
              err.message,
            );
            // نعيد المحاولة في الجولة الجاية
            if (attempt < maxAttempts) {
              scheduleNext();
              return;
            }
            finish();
            return;
          }
        }
      }

      // ── الخطوة 2: فحص انتشار الـ DNS ──────────────────────────────────
      const dnsCheck = await verifyDomainDns(cleanDomain);

      if (!dnsCheck.pointed) {
        if (attempt >= maxAttempts) {
          console.warn(
            `⚠️ [Background] Max attempts (${maxAttempts}) reached for "${cleanDomain}". Stopping.`,
          );
          finish();
          return;
        }
        scheduleNext();
        return;
      }

      console.log(
        `✅ [Background] DNS for "${cleanDomain}" is pointing to ${dnsCheck.expectedIp}!`,
      );

      // ── الخطوة 3: إصدار شهادة SSL ─────────────────────────────────────
      console.log(`🔐 [Background] Issuing SSL for "${cleanDomain}"...`);
      try {
        await installDomainSsl(cleanDomain);
        console.log(`🎉 [Background] SSL installed for "${cleanDomain}"!`);

        await ClientModel.findByIdAndUpdate(clientId, {
          custom_domain_status: "active",
          custom_domain_ssl: true,
          custom_domain_verified_at: new Date(),
        });

        console.log(`💾 [Background] Client record updated — "${cleanDomain}" is fully active`);
      } catch (sslErr: any) {
        console.error(
          `❌ [Background] SSL failed for "${cleanDomain}":`,
          sslErr.message,
        );
        // نعيد المحاولة — ممكن Let's Encrypt لسه محتاج وقت
        if (attempt < maxAttempts) {
          scheduleNext();
          return;
        }
      }

      finish();
    } catch (err: any) {
      console.warn(`[Background] Tick error for "${cleanDomain}":`, err.message);
      if (attempt < maxAttempts) {
        scheduleNext();
      } else {
        finish();
      }
    }
  };

  const scheduleNext = () => {
    let delayMs: number;
    if (attempt <= 6) {
      delayMs = 30_000; // كل 30 ثانية
    } else if (attempt <= 15) {
      delayMs = 120_000; // كل دقيقتين
    } else {
      delayMs = 300_000; // كل 5 دقائق
    }
    setTimeout(tick, delayMs);
  };

  const finish = () => {
    activeJobs.delete(cleanDomain);
  };

  // نبدأ أول محاولة بعد 3 ثوانٍ
  setTimeout(tick, 3_000);
}

/**
 * فاحص دوري لأي نطاقات معلقة — يعمل بعد إعادة تشغيل السيرفر
 * يبحث عن أي عميل حالته pending_setup أو pending_dns أو ssl=false
 */
export async function runPendingDomainsCheck(): Promise<void> {
  try {
    const pendingClients = await ClientModel.find({
      custom_domain: { $exists: true, $nin: [null, ""] },
      custom_domain_status: { $ne: "disabled" },
      $or: [
        { custom_domain_status: "pending_setup" },
        { custom_domain_status: "pending_dns" },
        { custom_domain_ssl: false },
      ],
    }).select("_id subdomain custom_domain custom_domain_status custom_domain_ssl");

    if (!pendingClients || pendingClients.length === 0) return;

    console.log(
      `[Background Scanner] Found ${pendingClients.length} pending custom domain(s)`,
    );

    for (const client of pendingClients) {
      if (!activeJobs.has(client.custom_domain!) && client.subdomain) {
        startDomainBackgroundSetup(
          client._id.toString(),
          client.custom_domain!,
          client.subdomain,
        );
      }
    }
  } catch (err: any) {
    console.warn("[Background Scanner] Failed to scan pending domains:", err.message);
  }
}

/**
 * تهيئة الفاحص الدوري عند إقلاع السيرفر
 */
export function initPeriodicCustomDomainWorker(): void {
  // فحص مبدئي بعد دقيقة من بدء السيرفر
  setTimeout(() => {
    runPendingDomainsCheck().catch(() => {});
  }, 60_000);

  // تكرار الفحص الدوري كل 15 دقيقة
  setInterval(() => {
    runPendingDomainsCheck().catch(() => {});
  }, 15 * 60_000);

  console.log(
    "🕒 [Background Worker] Custom Domain auto-setup worker initialized.",
  );
}
