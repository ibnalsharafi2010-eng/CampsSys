const express = require('express');
const cors = require('cors');
const path = require('path');
const sql = require('./db.js');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== إنشاء الجداول ==========
async function createTables() {
    try {
        // جدول الأصناف
        await sql`
            CREATE TABLE IF NOT EXISTS Items (
                Id SERIAL PRIMARY KEY,
                Name TEXT NOT NULL,
                Unit TEXT NOT NULL,
                Price REAL DEFAULT 0,
                RequiredQty REAL DEFAULT 0,
                AvailableQty REAL DEFAULT 0
            )
        `;

        // جدول المخيمات
        await sql`
            CREATE TABLE IF NOT EXISTS Camps (
                Id SERIAL PRIMARY KEY,
                Name TEXT NOT NULL,
                StartDate TEXT,
                EndDate TEXT,
                CasesCount INTEGER DEFAULT 0
            )
        `;

        // جدول الجرد
        await sql`
            CREATE TABLE IF NOT EXISTS Inventory (
                Id SERIAL PRIMARY KEY,
                ItemId INTEGER NOT NULL,
                CampId INTEGER NOT NULL,
                BeforeQty REAL DEFAULT 0,
                AfterQty REAL DEFAULT 0,
                UNIQUE(ItemId, CampId),
                FOREIGN KEY (ItemId) REFERENCES Items(Id) ON DELETE CASCADE,
                FOREIGN KEY (CampId) REFERENCES Camps(Id) ON DELETE CASCADE
            )
        `;

        // جدول المشتريات
        await sql`
            CREATE TABLE IF NOT EXISTS Purchases (
                Id SERIAL PRIMARY KEY,
                ItemId INTEGER NOT NULL,
                Qty REAL NOT NULL,
                Price REAL NOT NULL,
                CampId INTEGER NOT NULL,
                Date TEXT,
                FOREIGN KEY (ItemId) REFERENCES Items(Id) ON DELETE CASCADE,
                FOREIGN KEY (CampId) REFERENCES Camps(Id) ON DELETE CASCADE
            )
        `;

        // جدول المستحقات
        await sql`
            CREATE TABLE IF NOT EXISTS Payments (
                Id SERIAL PRIMARY KEY,
                TransNo TEXT UNIQUE DEFAULT '',
                Name TEXT NOT NULL,
                Specialization TEXT DEFAULT '',
                NumberOfDays INTEGER DEFAULT 0,
                DailyAmount REAL DEFAULT 0,
                Total REAL DEFAULT 0,
                Paid REAL DEFAULT 0,
                Remaining REAL DEFAULT 0,
                ClosedBalance INTEGER DEFAULT 0,
                CampId INTEGER NOT NULL,
                FOREIGN KEY (CampId) REFERENCES Camps(Id) ON DELETE CASCADE
            )
        `;
        
        console.log('✅ تم إنشاء جميع الجداول');
    } catch (error) {
        console.error('❌ خطأ في إنشاء الجداول:', error);
    }
}

// ========== دالة تحديث الكمية المتوفرة ==========
async function updateAvailableQty(itemId) {
    try {
        await sql`
            UPDATE Items 
            SET AvailableQty = (
                SELECT COALESCE(SUM(AfterQty), 0)
                FROM Inventory
                WHERE ItemId = ${itemId}
            )
            WHERE Id = ${itemId}
        `;
    } catch (error) {
        console.error('❌ خطأ في تحديث الكمية:', error);
    }
}

// ========== دالة تحديث جميع الكميات المتوفرة ==========
async function updateAllAvailableQtys() {
    try {
        await sql`
            UPDATE Items 
            SET AvailableQty = (
                SELECT COALESCE(SUM(AfterQty), 0)
                FROM Inventory
                WHERE ItemId = Items.Id
            )
        `;
        console.log('✅ تم تحديث جميع الكميات المتوفرة');
    } catch (error) {
        console.error('❌ خطأ:', error);
    }
}

// ========== مزامنة الرصيد السابق للمخيم الجديد ==========
app.post('/api/sync-to-new-camp', async (req, res) => {
    const { fromCampId, toCampId } = req.body;
    
    if (!fromCampId || !toCampId) {
        return res.status(400).json({ error: 'يجب تحديد المخيم المصدر والمخيم الهدف' });
    }
    
    try {
        await sql`
            INSERT INTO Inventory (ItemId, CampId, BeforeQty, AfterQty)
            SELECT 
                i.ItemId,
                ${toCampId} as CampId,
                i.AfterQty as BeforeQty,
                0 as AfterQty
            FROM Inventory i
            WHERE i.CampId = ${fromCampId}
            ON CONFLICT (ItemId, CampId) DO UPDATE SET
                BeforeQty = EXCLUDED.BeforeQty,
                AfterQty = EXCLUDED.AfterQty
        `;
        
        await updateAllAvailableQtys();
        
        res.json({ 
            success: true, 
            message: `تم مزامنة الرصيد من المخيم ${fromCampId} إلى المخيم ${toCampId}` 
        });
    } catch (error) {
        console.error('❌ خطأ في المزامنة:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== API Routes للأصناف ==========
app.get('/api/items', async (req, res) => {
    try {
        const items = await sql`SELECT * FROM Items ORDER BY Id`;
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/items/:id', async (req, res) => {
    try {
        const item = await sql`SELECT * FROM Items WHERE Id = ${req.params.id}`;
        res.json(item[0] || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/items', async (req, res) => {
    const { Name, Unit, Price, RequiredQty = 0 } = req.body;
    try {
        const [item] = await sql`
            INSERT INTO Items (Name, Unit, Price, RequiredQty, AvailableQty) 
            VALUES (${Name}, ${Unit}, ${Price || 0}, ${RequiredQty}, 0)
            RETURNING Id
        `;
        
        // تهيئة الجرد للمخيمات الموجودة
        const camps = await sql`SELECT Id FROM Camps`;
        for (const camp of camps) {
            await sql`
                INSERT INTO Inventory (ItemId, CampId, BeforeQty, AfterQty)
                VALUES (${item.Id}, ${camp.Id}, 0, 0)
                ON CONFLICT (ItemId, CampId) DO NOTHING
            `;
        }
        
        res.json({ Id: item.Id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/items/:id', async (req, res) => {
    const { Name, Unit, Price, RequiredQty } = req.body;
    try {
        const result = await sql`
            UPDATE Items 
            SET Name = ${Name}, Unit = ${Unit}, Price = ${Price}, RequiredQty = ${RequiredQty} 
            WHERE Id = ${req.params.id}
        `;
        res.json({ updated: result.count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/items/:id', async (req, res) => {
    try {
        const result = await sql`DELETE FROM Items WHERE Id = ${req.params.id}`;
        res.json({ deleted: result.count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== API Routes للمخيمات ==========
app.get('/api/camps', async (req, res) => {
    try {
        const camps = await sql`SELECT * FROM Camps ORDER BY Id DESC`;
        res.json(camps);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/camps', async (req, res) => {
    const { Name, StartDate, EndDate, CasesCount = 0 } = req.body;
    try {
        const [camp] = await sql`
            INSERT INTO Camps (Name, StartDate, EndDate, CasesCount) 
            VALUES (${Name}, ${StartDate}, ${EndDate}, ${CasesCount})
            RETURNING Id
        `;
        const newCampId = camp.Id;
        
        // تهيئة الجرد للمخيم الجديد
        const items = await sql`SELECT Id FROM Items`;
        for (const item of items) {
            await sql`
                INSERT INTO Inventory (ItemId, CampId, BeforeQty, AfterQty)
                VALUES (${item.Id}, ${newCampId}, 0, 0)
                ON CONFLICT (ItemId, CampId) DO NOTHING
            `;
        }
        
        res.json({ Id: newCampId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/camps/:id', async (req, res) => {
    const { Name, StartDate, EndDate, CasesCount } = req.body;
    try {
        const result = await sql`
            UPDATE Camps 
            SET Name = ${Name}, StartDate = ${StartDate}, EndDate = ${EndDate}, CasesCount = ${CasesCount} 
            WHERE Id = ${req.params.id}
        `;
        res.json({ updated: result.count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== API Routes للجرد ==========
app.get('/api/inventory/:campId', async (req, res) => {
    const campId = req.params.campId;
    try {
        const inventory = await sql`
            SELECT i.Id, i.Name, i.Unit, i.Price, i.AvailableQty, i.RequiredQty,
                   COALESCE(inv.BeforeQty, 0) as BeforeQty,
                   COALESCE(inv.AfterQty, 0) as AfterQty
            FROM Items i
            LEFT JOIN Inventory inv ON inv.ItemId = i.Id AND inv.CampId = ${campId}
            ORDER BY i.Id
        `;
        
        const result = inventory.map(row => ({
            ...row,
            RequiredForWork: row.RequiredQty || 0
        }));
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/inventory', async (req, res) => {
    const { ItemId, CampId, BeforeQty, AfterQty } = req.body;
    try {
        await sql`
            INSERT INTO Inventory (ItemId, CampId, BeforeQty, AfterQty)
            VALUES (${ItemId}, ${CampId}, ${BeforeQty}, ${AfterQty})
            ON CONFLICT (ItemId, CampId) DO UPDATE SET
                BeforeQty = EXCLUDED.BeforeQty,
                AfterQty = EXCLUDED.AfterQty
        `;
        await updateAvailableQty(ItemId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== API Routes للمشتريات ==========
app.get('/api/purchases/:campId', async (req, res) => {
    const campId = req.params.campId;
    try {
        const purchases = await sql`
            SELECT p.*, i.Name as ItemName, i.Unit, i.Price as ItemPrice
            FROM Purchases p
            JOIN Items i ON p.ItemId = i.Id
            WHERE p.CampId = ${campId}
            ORDER BY p.Date DESC
        `;
        res.json(purchases);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/purchases', async (req, res) => {
    const { ItemId, Qty, Price, CampId, Date } = req.body;
    
    try {
        // جلب الرصيد الحالي للمخيم
        const inventory = await sql`
            SELECT BeforeQty, AfterQty FROM Inventory 
            WHERE ItemId = ${ItemId} AND CampId = ${CampId}
        `;
        
        const currentAfterQty = inventory[0] ? inventory[0].AfterQty : 0;
        const newAfterQty = currentAfterQty + Qty;
        
        // إضافة سجل الشراء
        const [purchase] = await sql`
            INSERT INTO Purchases (ItemId, Qty, Price, CampId, Date) 
            VALUES (${ItemId}, ${Qty}, ${Price}, ${CampId}, ${Date || new Date().toISOString()})
            RETURNING Id
        `;
        
        // تحديث AfterQty في الجرد
        await sql`
            INSERT INTO Inventory (ItemId, CampId, BeforeQty, AfterQty)
            VALUES (${ItemId}, ${CampId}, ${inventory[0] ? inventory[0].BeforeQty : 0}, ${newAfterQty})
            ON CONFLICT (ItemId, CampId) DO UPDATE SET
                AfterQty = COALESCE(AfterQty, 0) + ${Qty}
        `;
        
        await updateAvailableQty(ItemId);
        res.json({ Id: purchase.Id, newAfterQty });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== API Routes لـ Payments ==========
app.get('/api/payments/:campId', async (req, res) => {
    const campId = req.params.campId;
    const showClosed = req.query.showClosed === 'true';
    
    try {
        let query = sql`
            SELECT Id, TransNo, Name, Specialization, NumberOfDays, DailyAmount, 
                   Total, Paid, (Total - Paid) as Remaining, ClosedBalance, CampId
            FROM Payments 
            WHERE CampId = ${campId}
        `;
        
        if (!showClosed) {
            query = query.where`ClosedBalance = 0`;
        }
        
        const payments = await query.orderBy`Id DESC`;
        res.json(payments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/payments', async (req, res) => {
    const { 
        Name, 
        Specialization, 
        NumberOfDays, 
        DailyAmount, 
        Total, 
        Paid, 
        CampId 
    } = req.body;
    
    try {
        const calculatedTotal = Total || (NumberOfDays * DailyAmount);
        const remaining = calculatedTotal - (Paid || 0);
        const transNo = `TRX-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
        
        const [payment] = await sql`
            INSERT INTO Payments (TransNo, Name, Specialization, NumberOfDays, DailyAmount, Total, Paid, Remaining, ClosedBalance, CampId) 
            VALUES (${transNo}, ${Name}, ${Specialization || ''}, ${NumberOfDays || 0}, ${DailyAmount || 0}, ${calculatedTotal}, ${Paid || 0}, ${remaining}, 0, ${CampId})
            RETURNING Id, TransNo
        `;
        
        res.json({ 
            Id: payment.Id,
            TransNo: payment.TransNo
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/payments/:id', async (req, res) => {
    const { Name, Specialization, NumberOfDays, DailyAmount, Total, Paid } = req.body;
    const calculatedTotal = Total || (NumberOfDays * DailyAmount);
    const remaining = calculatedTotal - (Paid || 0);
    
    try {
        const result = await sql`
            UPDATE Payments SET 
                Name = ${Name}, 
                Specialization = ${Specialization || ''}, 
                NumberOfDays = ${NumberOfDays || 0}, 
                DailyAmount = ${DailyAmount || 0}, 
                Total = ${calculatedTotal}, 
                Paid = ${Paid || 0}, 
                Remaining = ${remaining}
            WHERE Id = ${req.params.id}
        `;
        res.json({ updated: result.count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/payments/close/:id', async (req, res) => {
    try {
        const result = await sql`UPDATE Payments SET ClosedBalance = 1 WHERE Id = ${req.params.id}`;
        res.json({ closed: result.count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/payments/reopen/:id', async (req, res) => {
    try {
        const result = await sql`UPDATE Payments SET ClosedBalance = 0 WHERE Id = ${req.params.id}`;
        res.json({ reopened: result.count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/payments/:id', async (req, res) => {
    try {
        const result = await sql`DELETE FROM Payments WHERE Id = ${req.params.id}`;
        res.json({ deleted: result.count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== Dashboard API ==========
app.get('/api/dashboard/:campId', async (req, res) => {
    const campId = req.params.campId;
    
    try {
        // 1. معلومات المخيم
        const [camp] = await sql`SELECT * FROM Camps WHERE Id = ${campId}`;
        if (!camp) return res.status(404).json({ error: "المخيم غير موجود" });
        
        // 2. جرد الأصناف للمخيم
        const inventory = await sql`
            SELECT i.Id, i.Name, i.Unit, i.Price, i.RequiredQty,
                   COALESCE(inv.BeforeQty, 0) as BeforeQty,
                   COALESCE(inv.AfterQty, 0) as AfterQty,
                   (COALESCE(inv.BeforeQty, 0) - COALESCE(inv.AfterQty, 0)) as Consumption,
                   (i.RequiredQty - COALESCE(inv.AfterQty, 0)) as ToPurchase
            FROM Items i
            LEFT JOIN Inventory inv ON inv.ItemId = i.Id AND inv.CampId = ${campId}
            ORDER BY i.Id
        `;
        
        // 3. المشتريات
        const purchases = await sql`
            SELECT p.*, i.Name as ItemName, i.Unit
            FROM Purchases p
            JOIN Items i ON p.ItemId = i.Id
            WHERE p.CampId = ${campId}
            ORDER BY p.Date DESC
        `;
        
        // 4. المستحقات المالية
        const payments = await sql`
            SELECT Id, TransNo, Name, Specialization, NumberOfDays, DailyAmount,
                   Total, Paid, (Total - Paid) as Remaining, ClosedBalance
            FROM Payments 
            WHERE CampId = ${campId}
            ORDER BY ClosedBalance ASC, Id DESC
        `;
        
        // حساب الإجماليات
        const totals = {
            totalBefore: inventory.reduce((sum, item) => sum + (item.BeforeQty || 0), 0),
            totalAfter: inventory.reduce((sum, item) => sum + (item.AfterQty || 0), 0),
            totalConsumption: inventory.reduce((sum, item) => sum + (item.Consumption || 0), 0),
            totalToPurchase: inventory.reduce((sum, item) => sum + (Math.max(0, item.ToPurchase || 0)), 0),
            totalPurchasesQty: purchases.reduce((sum, p) => sum + (p.Qty || 0), 0),
            totalPurchasesValue: purchases.reduce((sum, p) => sum + ((p.Qty || 0) * (p.Price || 0)), 0),
            totalPayments: payments.reduce((sum, p) => sum + (p.Total || 0), 0),
            totalPaid: payments.reduce((sum, p) => sum + (p.Paid || 0), 0),
            totalRemaining: payments.reduce((sum, p) => sum + ((p.Total - p.Paid) || 0), 0)
        };
        
        res.json({
            camp,
            inventory,
            purchases,
            payments,
            totals
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== التقارير ==========
app.get('/api/report/available', async (req, res) => {
    try {
        const items = await sql`
            SELECT Id, Name, Unit, AvailableQty, Price, RequiredQty,
                   (AvailableQty * Price) as TotalValue
            FROM Items 
            ORDER BY AvailableQty DESC
        `;
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/report/low-stock', async (req, res) => {
    const threshold = req.query.threshold || 10;
    try {
        const items = await sql`
            SELECT Id, Name, Unit, AvailableQty, Price, RequiredQty
            FROM Items 
            WHERE AvailableQty <= ${threshold}
            ORDER BY AvailableQty ASC
        `;
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// تشغيل السيرفر
createTables().then(() => {
    app.listen(port, () => {
        console.log(`\n🚀 السيرفر يعمل على: http://localhost:${port}`);
        console.log(`📁 مجلد الملفات الثابتة: public/\n`);
        setTimeout(() => updateAllAvailableQtys(), 1000);
    });
});
