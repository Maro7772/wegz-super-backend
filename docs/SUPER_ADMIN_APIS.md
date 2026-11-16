# توثيق الـ APIs الجديدة — Super Admin (لوحة الإدارة الرئيسية)

يغطي هذا الملف جميع المسارات الجديدة (APIs) الخاصة بـ:
1. **الباقات (Packages)**
2. **طرق الدفع (Payment Methods)**
3. **طلبات الاشتراك والترقية (Orders)**

---

## 📌 القواعد العامة والـ Headers

* **Base URL:** `http://localhost:3000/api` (أو رابط الدومين الرئيسي لـ Super Admin).
* **المصادقة (Authentication):**
  ```http
  Authorization: Bearer <SUPER_ADMIN_JWT_TOKEN>
  ```
* **الصلاحيات (Permissions):**
  * `packages:view`, `packages:add`, `packages:edit`, `packages:delete`
  * `payment_methods:view`, `payment_methods:add`, `payment_methods:edit`, `payment_methods:delete`
  * `orders:view`, `orders:add`, `orders:edit`, `orders:delete`
  *(حسابات الـ Root Admin تمتلك كافة الصلاحيات تلقائياً)*.
* **خدمة الملفات الثابتة (Static Files):**
  * جميع الملفات المرفوعة (الأيقونات، الإيصالات) تُخدم عبر:
    `http://<HOST>/uploads/<filename>`
  * وتُرجع الـ APIs الروابط دائماً بصيغة رابط كامل مباشر وقابل للفتح والنقر.

---

# 1) باقات الاشتراك (Packages)

الجدول: `packages`  
الحقول: `name`, `price`, `months`, `status` (`active` | `inactive`), `discount`

---

### 1.1 إضافة باقة جديدة (Create Package)
* **المسار:** `POST /api/admin/packages`
* **Headers:**
  * `Authorization: Bearer <token>`
  * `Content-Type: application/json`
* **Request Body:**
  ```json
  {
    "name": "الباقة الذهبية السنوية",
    "price": 3000,
    "months": 12,
    "status": "active",
    "discount": 500
  }
  ```
  | الحقل | النوع | إلزامي؟ | الوصف |
  |---|---|---|---|
  | `name` | String | نعم | اسم الباقة |
  | `price` | Number | نعم | السعر الأصلي (أكبر من أو يساوي 0) |
  | `months` | Number | نعم | عدد الشهور (عدد صحيح أكبر من أو يساوي 1) |
  | `status` | String | لا | `active` أو `inactive` (الافتراضي `active`) |
  | `discount` | Number | لا | قيمة الخصم (الافتراضي 0) |

* **Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "Package created",
    "data": {
      "package": {
        "_id": "67389a0123456789abcdef01",
        "name": "الباقة الذهبية السنوية",
        "price": 3000,
        "months": 12,
        "status": "active",
        "discount": 500,
        "createdAt": "2026-11-16T13:00:00.000Z",
        "updatedAt": "2026-11-16T13:00:00.000Z"
      }
    }
  }
  ```

---

### 1.2 عرض قائمة الباقات (List Packages)
* **المسار:** `GET /api/admin/packages`
* **Headers:** `Authorization: Bearer <token>`
* **Query Parameters:**
  | البارامتر | النوع | اختياري؟ | الوصف |
  |---|---|---|---|
  | `status` | String | نعم | فلترة بالحالة: `active` أو `inactive` |
  | `search` | String | نعم | بحث باسم الباقة (Regex غير حساس لحالة الأحرف) |
  | `page` | Number | نعم | رقم الصفحة (افتراضي 1) |
  | `limit` | Number | نعم | عدد العناصر في الصفحة (افتراضي 10، حد أقصى 100) |

* **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Packages retrieved",
    "data": {
      "packages": [
        {
          "_id": "67389a0123456789abcdef01",
          "name": "الباقة الذهبية السنوية",
          "price": 3000,
          "months": 12,
          "status": "active",
          "discount": 500,
          "createdAt": "2026-11-16T13:00:00.000Z",
          "updatedAt": "2026-11-16T13:00:00.000Z"
        }
      ],
      "total": 1,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  }
  ```

---

### 1.3 تفاصيل باقة محددة (Get Package by ID)
* **المسار:** `GET /api/admin/packages/:id`
* **Headers:** `Authorization: Bearer <token>`
* **Params:** `id` (ObjectId للباقة)
* **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Package retrieved",
    "data": {
      "package": {
        "_id": "67389a0123456789abcdef01",
        "name": "الباقة الذهبية السنوية",
        "price": 3000,
        "months": 12,
        "status": "active",
        "discount": 500,
        "createdAt": "2026-11-16T13:00:00.000Z",
        "updatedAt": "2026-11-16T13:00:00.000Z"
      }
    }
  }
  ```

---

### 1.4 تعديل باقة (Update Package)
* **المسار:** `PATCH /api/admin/packages/:id`
* **Headers:**
  * `Authorization: Bearer <token>`
  * `Content-Type: application/json`
* **Request Body (جميع الحقول اختيارية):**
  ```json
  {
    "name": "الباقة الذهبية المطورة",
    "price": 3200,
    "discount": 400,
    "status": "active"
  }
  ```
* **Response (200 OK):** يعيد بيانات الباقة بعد التحديث.

---

### 1.5 حذف باقة (Delete Package)
* **المسار:** `DELETE /api/admin/packages/:id`
* **Headers:** `Authorization: Bearer <token>`
* **Params:** `id`
* **ملاحظة أمان:** إذا كانت الباقة مستخدمة في أي طلب (`order`) سابق، يتم منع الحذف وإرجاع خطأ `400` يطلب تحويل حالتها إلى `inactive` بدلاً من حذفها.
* **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Package deleted"
  }
  ```

---

# 2) طرق الدفع (Payment Methods)

الجدول: `payment_methods`  
الحقول: `name`, `icon` (ملف صورة), `description`, `status` (`active` | `inactive`)  
**ميزة الملفات:** عند التعديل وحفظ صورة جديدة، يتم حذف الصورة القديمة تلقائياً من القرص، وعند حذف طريقة الدفع يتم مسح ملف الصورة أيضاً.

---

### 2.1 إضافة طريقة دفع (Create Payment Method)
* **المسار:** `POST /api/admin/payment-methods`
* **Headers:**
  * `Authorization: Bearer <token>`
  * `Content-Type: multipart/form-data`
* **Form-Data Body:**
  | الحقل | النوع | إلزامي؟ | الوصف |
  |---|---|---|---|
  | `name` | Text | نعم | اسم طريقة الدفع (مثال: فودافون كاش / تحويل بنكي) |
  | `description` | Text | لا | وصف أو تعليمات التحويل للعميل |
  | `status` | Text | لا | `active` أو `inactive` (الافتراضي: `active`) |
  | `icon` | File | لا | ملف أيقونة طريقة الدفع (jpeg, png, webp, gif, svg) |

* **Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "Payment method created",
    "data": {
      "payment_method": {
        "_id": "67389b0123456789abcdef02",
        "id": "67389b0123456789abcdef02",
        "name": "فودافون كاش",
        "description": "يرجى التحويل على رقم 010XXXXXXXX وكتابة رقم التحويل في الإيصال",
        "status": "active",
        "icon": "http://localhost:3000/uploads/1731762000000-123456789.png",
        "createdAt": "2026-11-16T13:00:00.000Z",
        "updatedAt": "2026-11-16T13:00:00.000Z"
      }
    }
  }
  ```

---

### 2.2 عرض طرق الدفع (List Payment Methods)
* **المسار:** `GET /api/admin/payment-methods`
* **Headers:** `Authorization: Bearer <token>`
* **Query Parameters:** `status` (`active` | `inactive`), `search`, `page`, `limit`
* **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Payment methods retrieved",
    "data": {
      "payment_methods": [
        {
          "_id": "67389b0123456789abcdef02",
          "id": "67389b0123456789abcdef02",
          "name": "فودافون كاش",
          "description": "...",
          "status": "active",
          "icon": "http://localhost:3000/uploads/1731762000000-123456789.png"
        }
      ],
      "total": 1,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  }
  ```

---

### 2.3 تفاصيل طريقة دفع (Get Payment Method by ID)
* **المسار:** `GET /api/admin/payment-methods/:id`
* **Headers:** `Authorization: Bearer <token>`

---

### 2.4 تعديل طريقة دفع (Update Payment Method)
* **المسار:** `PATCH /api/admin/payment-methods/:id`
* **Headers:**
  * `Authorization: Bearer <token>`
  * `Content-Type: multipart/form-data` (أو `application/json` إذا لم يتغير الملف)
* **ملاحظة:** إذا رُفع ملف جديد في الحقل `icon`، يحذف السيستم الصورة القديمة فوراً ويضع الجديدة.

---

### 2.5 حذف طريقة دفع (Delete Payment Method)
* **المسار:** `DELETE /api/admin/payment-methods/:id`
* **Headers:** `Authorization: Bearer <token>`
* **ملاحظة:** يتم حذف ملف الأيقونة من القرص مع مسح السجل، ويُمنع الحذف إذا كان هناك طلبات مرتبطة بها.

---

# 3) طلبات الاشتراك (Orders)

الجدول: `orders`  
الحقول: `package_id`, `client_id`, `payment_method_id`, `price`, `discount`, `final_price`, `status` (`pending`, `approve`, `reject`), `reject_reason`, `receipt` (ملف إيصال).

---

### 3.1 القوائم المنسدلة للطلبات (Order Form Dropdown Lists)
يُستخدم في شاشات إضافة/تعديل وفلترة الطلبات في الواجهة.
* **المسار:** `GET /api/admin/orders/lists`
* **Headers:** `Authorization: Bearer <token>`
* **الشرط:** يرجع فقط العناصر النشطة (`status: "active"`).
* **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Order form lists retrieved",
    "data": {
      "payment_methods": [
        {
          "id": "67389b0123456789abcdef02",
          "name": "فودافون كاش"
        }
      ],
      "packages": [
        {
          "id": "67389a0123456789abcdef01",
          "name": "الباقة الذهبية السنوية"
        }
      ],
      "clients": [
        {
          "id": "67389c0123456789abcdef03",
          "company_name": "متجر البركة",
          "subdomain": "baraka"
        }
      ]
    }
  }
  ```

---

### 3.2 استعراض الطلبات مع التصفح والفلترة (View Orders)
* **المسار:** `GET /api/admin/orders`
* **Headers:** `Authorization: Bearer <token>`
* **Query Parameters:**
  | البارامتر | النوع | اختياري؟ | الوصف |
  |---|---|---|---|
  | `status` | String | نعم | فلترة بالحالة: `pending` أو `approve` أو `reject` |
  | `client_id` | ObjectId | نعم | فلترة بطلب عميل محدد |
  | `package_id` | ObjectId | نعم | فلترة بطلب باقة محددة |
  | `payment_method_id` | ObjectId | نعم | فلترة بطريقة دفع محددة |
  | `page` | Number | نعم | رقم الصفحة (افتراضي 1) |
  | `limit` | Number | نعم | العناصر في الصفحة (افتراضي 10) |

* **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Orders retrieved",
    "data": {
      "orders": [
        {
          "_id": "67389d0123456789abcdef04",
          "id": "67389d0123456789abcdef04",
          "package_id": {
            "_id": "67389a0123456789abcdef01",
            "name": "الباقة الذهبية السنوية",
            "price": 3000,
            "months": 12,
            "discount": 500
          },
          "client_id": {
            "_id": "67389c0123456789abcdef03",
            "company_name": "متجر البركة",
            "email": "owner@baraka.com",
            "subdomain": "baraka"
          },
          "payment_method_id": {
            "_id": "67389b0123456789abcdef02",
            "name": "فودافون كاش",
            "icon": "http://localhost:3000/uploads/icon.png",
            "description": "..."
          },
          "price": 3000,
          "discount": 500,
          "final_price": 2500,
          "status": "pending",
          "reject_reason": null,
          "receipt": "http://localhost:3000/uploads/1731762500000-receipt.pdf",
          "createdAt": "2026-11-16T13:10:00.000Z",
          "updatedAt": "2026-11-16T13:10:00.000Z"
        }
      ],
      "total": 1,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  }
  ```

---

### 3.3 تفاصيل طلب محدد (Get Order by ID)
* **المسار:** `GET /api/admin/orders/:id`
* **Headers:** `Authorization: Bearer <token>`
* **Response (200 OK):** يعيد تفاصيل الطلب مع الـ Populate للعميل والباقة وطريقة الدفع، ورابط الإيصال كـ link مباشر.

---

### 3.4 قبول واعتماد الطلب (Approve Order)
* **المسار:** `POST /api/admin/orders/:id/approve`
* **Headers:**
  * `Authorization: Bearer <token>`
  * `Content-Type: application/json`
* **الوصف ومنطق العمليات (Business Logic):**
  1. تحويل حالة الطلب إلى `order.status = "approve"`.
  2. تحديث بيانات العميل في جدول `Client`:
     * `start_date = now()` (تاريخ اللحظة الحالية).
     * `end_date = now() + orders.package.months` (إضافة عدد شهور الباقة بدقة).
     * `status = "active"` (تفعيل حساب العميل).
* **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Order approved successfully",
    "data": {
      "order": {
        "_id": "67389d0123456789abcdef04",
        "status": "approve",
        "receipt": "http://localhost:3000/uploads/..."
      },
      "client": {
        "id": "67389c0123456789abcdef03",
        "company_name": "متجر البركة",
        "subdomain": "baraka",
        "status": "active",
        "start_date": "2026-11-16T13:15:00.000Z",
        "end_date": "2027-11-16T13:15:00.000Z"
      }
    }
  }
  ```

---

### 3.5 رفض الطلب (Reject Order)
* **المسار:** `POST /api/admin/orders/:id/reject`
* **Headers:**
  * `Authorization: Bearer <token>`
  * `Content-Type: application/json`
* **Request Body:**
  ```json
  {
    "reject_reason": "صورة الإيصال غير واضحة ورقم التحويل غير مكتمل"
  }
  ```
  *(ملاحظة: حقل `reject_reason` إلزامي ويتم التحقق منه برمجياً)*.
* **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Order rejected successfully",
    "data": {
      "order": {
        "_id": "67389d0123456789abcdef04",
        "status": "reject",
        "reject_reason": "صورة الإيصال غير واضحة ورقم التحويل غير مكتمل"
      }
    }
  }
  ```

---

### 3.6 إضافة طلب يدوياً من السوبر أدمن (Add Order)
* **المسار:** `POST /api/admin/orders`
* **Headers:**
  * `Authorization: Bearer <token>`
  * `Content-Type: multipart/form-data`
* **ملاحظة هامة:** عند إنشاء الطلب من قبل السوبر أدمن، تصبح حالته **`approve` مباشرة وتلقائياً**، ويتم تطبيق منطق الاعتماد فوراً وتحديث اشتراك العميل (`start_date = now()`, `end_date = now() + package.months`, `status = active`).
* **Form-Data Body:**
  | الحقل | النوع | إلزامي؟ | الوصف |
  |---|---|---|---|
  | `package_id` | Text | نعم | معرّف الباقة |
  | `client_id` | Text | نعم | معرّف العميل |
  | `payment_method_id` | Text | نعم | معرّف طريقة الدفع |
  | `price` | Number | لا | يتم احتسابه تلقائياً من الباقة إن لم يُرسل |
  | `discount` | Number | لا | يتم احتسابه تلقائياً من الباقة إن لم يُرسل |
  | `final_price` | Number | لا | السعر النهائي بعد الخصم |
  | `status` | Text | لا | الافتراضي: `approve` تلقائياً |
  | `reject_reason` | Text | اختياري | إلزامي فقط لو أُرسلت الحالة كـ `reject` صراحة |
  | `receipt` | File | لا | ملف الإيصال (صورة أو PDF) |

* **Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "Order created and approved successfully",
    "data": {
      "order": {
        "_id": "67389d0123456789abcdef04",
        "package_id": "...",
        "client_id": "...",
        "status": "approve",
        "final_price": 2500,
        "receipt": "http://localhost:3000/uploads/..."
      },
      "client": {
        "id": "67389c0123456789abcdef03",
        "company_name": "متجر البركة",
        "subdomain": "baraka",
        "status": "active",
        "start_date": "2026-11-16T13:15:00.000Z",
        "end_date": "2027-11-16T13:15:00.000Z"
      }
    }
  }
  ```

---

### 3.7 تعديل طلب (Update Order)
* **المسار:** `PATCH /api/admin/orders/:id`
* **Headers:**
  * `Authorization: Bearer <token>`
  * `Content-Type: multipart/form-data` (أو `application/json`)
* **ملاحظة:** يدعم استبدال ملف الإيصال القديم بالجديد، وتغيير الحالات مع تطبيق شروط الـ approve / reject.

---

### 3.8 حذف طلب (Delete Order)
* **المسار:** `DELETE /api/admin/orders/:id`
* **Headers:** `Authorization: Bearer <token>`
* **الوصف:** يحذف الطلب ومعه ملف الإيصال المخزن على القرص.
