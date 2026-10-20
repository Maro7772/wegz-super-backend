# نشر Wegz Super Backend على Plesk

> **قبل أي حاجة:** خُد نسخة احتياطية من `dist` و `.env` الحاليين على السيرفر.

## 1) اللي في الحزمة

```
dist/                       ← البناء الجديد (استبدل القديم بالكامل)
scripts/migrate-to-plesk.cjs ← سكريبت ترحيل الداتابيز
openAPI.json                ← عقد الـ API للفرونت
package.json                ← فيه أمر migrate:plesk
README.md
```

مش موجود فيها `.env` ولا `node_modules` ولا `src` — السيرفر عنده already.

## 2) ارفع وفك الضغط

من Plesk → File Manager → فولدر المشروع (نفس المكان اللي فيه `dist` و `.env`):

1. ارفع `wegz-super-backend-deploy.zip`.
2. فك الضغط.
3. **امسح `dist` القديم بالكامل** الأول، وبعدين انقل `dist` الجديد مكانه.
   - مهم جدًا: لو سيبت chunks قديمة، ممكن السيرفر يشغّل كود قديم.
4. تأكد إن `scripts/migrate-to-plesk.cjs` موجود.

## 3) عدّل `.env` على السيرفر

سيب `MONGO_URI` على Atlas دلوقتي (مؤقتًا)، وضيف/عدّل دول:

```env
PLESK_MONGO_URI=mongodb://127.0.0.1:32768
PLESK_MONGO_USER=admin
PLESK_MONGO_PASS=MONGO@3030
TENANT_DB_PREFIX=sc_
PLESK_HOST=localhost
```

## 4) وقّف تطبيق Node من Plesk

مهم عشان مفيش كتابة أثناء النقل.

## 5) جرّب الترحيل بدون كتابة

من SSH أو Plesk Scheduled Task، وداخل فولدر المشروع:

```bash
SOURCE_MONGO_URI="$(grep -m1 '^MONGO_URI=' .env | sed 's/^MONGO_URI=//')" \
  DRY_RUN=1 node scripts/migrate-to-plesk.cjs
```

لازم تشوف:

```
Tenant DBs to copy: sc_6ac693f653d47db676f5820e
Orphan tenant DBs (skipped): sc_6ac6420775434eb97f3e72dd
```

## 6) نفّذ الترحيل

```bash
SOURCE_MONGO_URI="$(grep -m1 '^MONGO_URI=' .env | sed 's/^MONGO_URI=//')" \
  CONFIRM=YES node scripts/migrate-to-plesk.cjs
```

السكريبت بيعمل `ping` على Plesk Mongo الأول. لو فشل:
- اتأكد إن MongoDB شغال على 32768.
- اتأكد من `admin` / `MONGO@3030`.

## 7) غيّر `MONGO_URI` لـ Plesk

```env
MONGO_URI=mongodb://admin:MONGO%403030@127.0.0.1:32768/SuperWegz?authSource=admin
```

## 8) شغّل التطبيق

## 9) تأكد

```http
GET /api/admin/diagnostics/mongo
Authorization: Bearer <root token>
```

لازم يرجع:

```json
{
  "connected": true,
  "databases": ["SuperSystego", "SuperWegz", "sc_6ac693f653d47db676f5820e", "..."]
}
```

## 10) العميل القديم

```http
POST /api/admin/clients/6ac693f653d47db676f5820e/retry-provisioning
```

بعدها اعمل Restart لتطبيق العميل من Plesk عشان يقرأ `.env` الجديد.

---

## لو حصلت مشكلة

### التطبيق مش بيفتح

رجّع `.env` القديم (Atlas) مؤقتًا:

```env
MONGO_URI=<رابط Atlas القديم>
```

وشوف اللوج.

### الترحيل فشل في النص

السكريبت idempotent — شغّله تاني. هو بيعمل drop للـ collection الهدف قبل النسخ، فمش هيكرر.

### عايز ترجع للنسخة القديمة

رجّع مجلد `dist` القديم و `.env` القديم، واعمل Restart.
