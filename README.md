# وصلي (Wassli) — Clean Checkpoint
مشروع جديد من الصفر **بدون Supabase** وبدون أي اعتماد على المشروع القديم.

- Frontend: React + Vite + TypeScript + Tailwind
- Backend: Node.js + Express
- Database: SQLite
- Auth: JWT + bcrypt
- Roles: customer / courier / admin
- Arabic RTL

## التشغيل
`npm install`
ثم `npm run dev`

Frontend: http://localhost:5173
API: http://localhost:4000

`npm run seed:admin` ينشئ مشرف تطوير افتراضيًا.

## التسعير
150 دج حتى 2 كم، ثم +50 دج لكل كم إضافي، مع إمكانية اقتراح العميل لسعره.

## الحالة الحالية
- تسجيل/دخول (JWT + bcrypt) — جاهز.
- واجهة العميل: إنشاء طلب (مع اقتراح سعر اختياري)، عرض طلباتي، إلغاء طلب معلّق، تقييم المندوب بعد التسليم، إرسال ومتابعة الشكاوى.
- واجهة المندوب: عرض الطلبات المتاحة، قبول الطلب، تأكيد التسليم عبر رمز يعطيه العميل.
- واجهة الإدارة: نظرة عامة/إحصائيات، كل الطلبات، قائمة المستخدمين، تعديل إعدادات التسعير والعمولة، الرد على الشكاوى.
- كل شيء يعمل بدون Supabase — Express + SQLite + JWT فقط، كما هو مطلوب.

## ملاحظة تشغيل
لم يتم تنفيذ `npm install` / `npm run typecheck` / `npm run build` داخل بيئة التوليد لأن الشبكة كانت معطّلة فيها (لا يمكن الوصول لـ npm registry). نفّذها محليًا على جهازك بالترتيب في CLAUDE_START_HERE.md.
