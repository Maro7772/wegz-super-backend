# Wegz Super Admin — دليل الفرونت اند

> **اقرأ الملفات بالترتيب ده.** كل ملف فيه الـ endpoints الحقيقية بالـ request/response بالظبط،
> ومكتوب فيه إيه اللي الفرونت يعمله وإيه اللي **مايعملوش**.
>
> آخر تحديث: متطابق مع `openAPI.json` v1.1.0 — **50 path / 67 operation**.

---

## 📚 فهرس الملفات

| # | الملف | بيتكلم عن |
|---|---|---|
| 00 | [conventions.md](./00-conventions.md) | Base URL، الـ Auth، شكل الـ response، الأخطاء، الـ enums، helper الصلاحيات |
| 01 | [shell.md](./01-shell.md) | الـ Layout، الـ Sidebar، الراوتس، حماية الصفحات |
| 02 | [dashboard.md](./02-dashboard.md) | صفحة الرئيسية / لوحة التحكم |
| 03 | [clients.md](./03-clients.md) | **العملاء** — القائمة، الإضافة، التفاصيل، التجهيز، الحذف |
| 04 | [sections.md](./04-sections.md) | الأقسام |
| 05 | [sales.md](./05-sales.md) | المبيعات |
| 06 | [payments.md](./06-payments.md) | المدفوعات + approve / reject |
| 07 | [operation-reports.md](./07-operation-reports.md) | تقارير التشغيل + الملاحظات |
| 08 | [financial-reports.md](./08-financial-reports.md) | التقارير المالية |
| 09 | [admins-permissions.md](./09-admins-permissions.md) | المشرفين + مصفوفة الصلاحيات |
| 10 | [audit.md](./10-audit.md) | سجل التدقيق |
| 99 | [checklist.md](./99-checklist.md) | ✅ شيك ليست قبل التسليم |

---

## 🗺️ خريطة الصفحات

```
/login
└── /                        → Home & Dashboard      (dashboard:view)
    ├── /clients             → Clients               (clients:view)
    │   ├── /clients/new     → Add client            (clients:add)
    │   └── /clients/:id     → Client details        (clients:view)
    ├── /sections            → Sections              (sections:view)
    ├── /sales               → Sales                 (sales:view)
    ├── /payments            → Payments              (payments:view)
    ├── /reports/operations  → Operation Reports     (reports:view)
    ├── /reports/financial   → Financial Reports     (financial_reports:view)
    ├── /admins              → Super Admins          (admins:view)
    └── /audit               → Audit Log             (audit:view)
```

**Provisioning مش صفحة** — هو أزرار جوه `/clients/:id`.
**الـ Permissions مش صفحة** — هي Tab جوه `/admins/:id`.

---

## ⚡ TL;DR للفرونت

1. `POST /api/auth/login` → خزّن الـ `token` → `GET /api/auth/me` → خزّن `permissions`.
2. كل request: `Authorization: Bearer <token>`.
3. كل عنصر UI (زرار / تاب / لينك في السايدبار) يظهر بـ `hasPermission("resource:action")`.
4. أي `401` → امسح التوكن وروح `/login`. أي `403` → "مش عندك صلاحية".
5. إضافة عميل = **`POST /api/admin/clients` وبس** → بيرجع `202` → poll على `provisioning-status`.

---

## 🔗 مصادر مساعدة

- `../../openAPI.json` — الـ spec الكامل (يتفتح في Swagger UI / Postman)
- `../../README.md` — إعدادات السيرفر والـ env
