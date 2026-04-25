# نظام إدارة المخيم الطبي

مشروع لإدارة المخيمات الطبية والمستحقات المالية والمشتريات.

## التثبيت والتشغيل

### محلياً (مع SQLite):
```bash
npm install
npm run local
```

### على Vercel/الإنتاج (مع PostgreSQL):
```bash
npm install
npm start
```

## قاعدة البيانات

- **التطوير المحلي**: SQLite (`medical.db`)
- **الإنتاج**: PostgreSQL (Supabase)

## متغيرات البيئة

```env
DATABASE_URL=postgresql://postgres.sb_publishable_s7H2Ion6rXEWvNfMCMi2Uw_cfxLwYfY@aws-0-me-south-1.pooler.supabase.com:6543/postgres
```

## الرفع على GitHub

1. تأكد من إضافة متغيرات البيئة في Vercel
2. ارفع المشروع إلى GitHub
3. قم بربط المستودع بـ Vercel للنشر التلقائي

## المميزات

- إدارة المخيمات الطبية
- تتبع المشتريات والمستحقات
- نظام جرد متكامل
- تقارير وإحصائيات
