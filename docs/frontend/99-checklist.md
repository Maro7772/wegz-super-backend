# 99 — ✅ شيك ليست قبل التسليم

امش على البنود دي بالترتيب. لو بند مش متأكد منه، متعلّمش عليه.

---

## A) الأساسيات

- [ ] `VITE_API_URL` مضبوط على `https://superback.wegz.org`
- [ ] `axios` interceptor بيحط `Authorization: Bearer <token>` على كل request
- [ ] `401` → امسح التوكن + `window.location = "/login"`
- [ ] `403` → Toast "مش عندك صلاحية" (مش redirect)
- [ ] بعد الـ login → `GET /api/auth/me` → خزّن `permissions` + `is_root`
- [ ] `hasPermission()` بترجع `true` دايمًا لو `is_root`
- [ ] بعد الـ refresh → `/me` تتنادى تاني (التوكن لسه في الـ storage)
- [ ] مفيش أي endpoint بيتبعت من غير `/api` prefix
- [ ] كل الـ enums في ملف `constants` واحد — مش مكتوبة بيد في المكونات

---

## B) الـ Shell

- [ ] السايدبار RTL
- [ ] كل عنصر في السايدبار بيظهر بس لو عنده الصلاحية
- [ ] لو `permissions = []` → صفحة "مالكش صلاحيات" مش redirect loop
- [ ] كل Route محمي بـ `ProtectedRoute` + الصلاحية الصح
- [ ] صفحة 403 موجودة (مش redirect للرئيسية)
- [ ] الـ Header فيه اسم الأدمن + Badge Root + زرار خروج
- [ ] على الموبايل السايدبار Drawer

---

## C) العملاء (الأهم)

### القائمة
- [ ] `GET /api/admin/clients` بيتبعت بـ `status` / `section_id` / `search`
- [ ] البحث بـ debounce (400ms)
- [ ] `status` و `provisioning_status` **عمودين منفصلين**
- [ ] `sections_count / total_sections` معروضين
- [ ] `provisioning_error` بيظهر للعملاء الـ `failed`
- [ ] Empty state + Loading skeleton

### الإضافة
- [ ] الزرار بيظهر بس بـ `clients:add`
- [ ] الـ 4 حقول الإجبارية عليهم validation في الفرونت
- [ ] الباسورد **min 6** + زرار إظهار
- [ ] الـ subdomain فيه regex `/^[a-z0-9-]+$/`
- [ ] تحذير: "الـ Subdomain مش هيتغير بعد الإنشاء"
- [ ] الـ sections multi-select من `/api/admin/sections?status=active`
- [ ] الزرار بيتعطّل أثناء الـ request (منع double submit)
- [ ] بيعالج `409` (إيميل/subdomain مكرر) برسالة واضحة
- [ ] بعد `202` → redirect لصفحة العميل + Toast
- [ ] بيعالج `provisioning_started: false` ببانر + زرار Retry

### التفاصيل
- [ ] `GET /api/admin/clients/:id`
- [ ] فورم التعديل **مفيهوش** `password` ولا `subdomain` ولا `db_name`
- [ ] `sections` بتتحفظ بـ `PUT /:id/sections` (أو `PATCH` مع `sections`)
- [ ] الـ Provisioning Stepper بالـ 6 خطوات
- [ ] **الـ polling بيتوقف** عند `completed` أو `failed`
- [ ] `retry-provisioning` / `provision-now` بيظهروا بس بـ `provisioning:add`
- [ ] اللوج في `<pre>` + Copy
- [ ] **API key Modal**: بيظهر مرة واحدة + Copy + تحذير أحمر
- [ ] `reset-admin-password`: حقلين + تأكيد + min 6
- [ ] SSL: بيعرض نتايج كل subdomain
- [ ] Danger Zone منفصلة لـ "حذف كامل"
- [ ] "حذف كامل" بيطلب كتابة الـ subdomain/اسم الشركة
- [ ] "حذف السجل" و "حذف كامل" **مش جنب بعض**

---

## D) الأقسام

- [ ] `with_counts=true` عشان `clients_count`
- [ ] حقل `key` بيقول "هيتولد تلقائيًا"
- [ ] تغيير الحالة بـ `PATCH`
- [ ] حذف سيكشن مستخدم → بيقرأ `409` → Dialog بيقول عدد العملاء → `force=true` بعد التأكيد
- [ ] بعد الحذف بـ `force` → Toast فيه `clients_affected`

---

## E) المبيعات

- [ ] `pagination` شغالة (`page` / `limit`)
- [ ] `total` بيتحسب في الفرونت كـ preview (والسيرفر بيحسبه تاني)
- [ ] `sale_no` و `total` **مش بيتبعتوا** في الـ create
- [ ] `client_id` Searchable select
- [ ] الإحصائيات: `by_status` بيستخدم `_id`
- [ ] الشهور الناقصة بتتملى بـ `0` في الشارت
- [ ] حذف Sale → رسالة "الدفعات المرتبطة هتفضل موجودة"

---

## F) المدفوعات

- [ ] الفلتر بيستخدم **`approve`** و **`reject`** (مش approved/rejected)
- [ ] الـ KPI من `data.summary` مش محسوبة في الفرونت
- [ ] `search` بيدوّر في `reference`
- [ ] زرار approve بيظهر بس للـ `pending`
- [ ] زرار delete **مخفي** للـ `approve`
- [ ] approve → ConfirmDialog بيوضّح إنه هيفعّل العميل
- [ ] reject → Modal بسبب (textarea)
- [ ] بعد approve → refresh للعميل والقائمة

---

## G) تقارير التشغيل

- [ ] الفلترة في الفرونت (الـ endpoint مش بيقبل فلاتر)
- [ ] `operation_status` Badge بألوان
- [ ] الملاحظات بتتبني من `data.notes` الراجعة (مش من state محلي)
- [ ] حذف ملاحظة بـ **index** (0-based) — مع تحذير إعادة الترتيب
- [ ] تغيير الحالة بيستخدم `PATCH .../status`

---

## H) التقارير المالية

- [ ] ملاحظة "العميل بأكتر من قسم بيتحسب في كل قسم" تحت `/by-section`
- [ ] `mrr_last_30_days` و `pending_payments` **مش** متأثرين بالفلتر
- [ ] `/by-category` **مش مستخدم**
- [ ] `year` بيتغلب على `from/to` في `/monthly`
- [ ] `age_days` بألوان (0–7 / 8–30 / 31+)

---

## I) المشرفين والصلاحيات

- [ ] جدول الصلاحيات مبني من `permissions/catalog` ديناميكيًا
- [ ] الخانة الغير موجودة = `—` مش checkbox
- [ ] المشرف الجديد → تنبيه "مالوش صلاحيات"
- [ ] `PUT /permissions` بيبعت **المصفوفة الكاملة**
- [ ] زرار تعديل الصلاحيات **مخفي** لنفسك
- [ ] الـ Root → الجدول read-only
- [ ] `status: "inactive"` → تحذير إنه مش هيعرف يدخل
- [ ] `id` مش `_id` في كل استجابات المشرفين

---

## J) التدقيق

- [ ] `pagination.totalPages` (مش `pages`)
- [ ] `admin_id` ممكن يكون `null` → "النظام"
- [ ] `action` فلتر prefix
- [ ] `metadata` في Modal كـ pretty JSON
- [ ] مفيش أزرار تعديل/حذف

---

## K) الجودة

- [ ] مفيش `console.log` في الـ production build
- [ ] مفيش نص إنجليزي من الـ backend معروض للمستخدم من غير معالجة
- [ ] كل الأزرار الخطيرة فيها ConfirmDialog
- [ ] Loading state على **كل** زرار async (منع double click)
- [ ] كل الجداول فيها Empty state
- [ ] كل الأخطاء بتظهر في Toast أو تحت الحقل
- [ ] الـ polling بيتوقف عند الحالة النهائية
- [ ] مفيش token في الـ URL
- [ ] مفيش password بيظهر في أي response أو log
- [ ] الـ hard refresh على أي route شغال (SPA fallback على السيرفر)

---

## L) اختبار يدوي سريع (Smoke Test)

اعمل السيناريو ده بالترتيب على بيئة staging:

1. [ ] Login بـ root → السايدبار فيه 9 عناصر
2. [ ] Dashboard بيفتح والأرقام ظاهرة
3. [ ] إضافة قسم جديد → يظهر في القائمة
4. [ ] إضافة عميل:
   - [ ] subdomain جديد
   - [ ] باسورد 6 حروف
   - [ ] سيكشن واحد
   - [ ] بعد الحفظ → redirect + Stepper بيتحرك
   - [ ] Stepper بيوصل `completed` والـ polling وقف
5. [ ] إضافة دفعة `pending` للعميل
6. [ ] اعتماد الدفعة → العميل بقى `active`
7. [ ] إضافة Sale → `total` اتحسب صح
8. [ ] تقرير التشغيل → إضافة ملاحظة → حذفها
9. [ ] تقرير مالي → الفلاتر بتشتغل
10. [ ] إنشاء مشرف جديد → يديله `clients:view` بس
11. [ ] Login بالمشرف الجديد → السايدبار فيه العملاء بس
12. [ ] المشرف يحاول يفتح `/admins` مباشرة → 403
13. [ ] المشرف يحاول `POST /api/admin/clients` بـ curl → 403
14. [ ] Audit → العملية مسجلة
15. [ ] Root يعمل logout → login تاني → كل حاجة زي ما هي

---

## M) قبل الـ Deploy

- [ ] `npm run build` ناجح
- [ ] `.env` على السيرفر فيه `VITE_API_URL` الصح
- [ ] الـ SPA fallback مضبوط (`.htaccess` / nginx `try_files`)
- [ ] الـ CORS على الـ backend بيسمح لدومين الفرونت (`SUPER_FRONTEND_URL`)
- [ ] Hard refresh بعد النشر

---

## 📞 لو حاجة مش واضحة

ارجع للملف المخصص:
- العملاء → [03-clients.md](./03-clients.md)
- الصلاحيات → [09-admins-permissions.md](./09-admins-permissions.md)
- الأكواد والأخطاء → [00-conventions.md](./00-conventions.md)
