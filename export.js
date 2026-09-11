const admin = require('firebase-admin');
const fs = require('fs');
const serviceAccount = require('./firebase-service.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// الكولكشنز المتوقعة بناءً على مشروع الموارد البشرية والعقود
const collections = ['users', 'contracts', 'employees', 'renewals'];

async function exportData() {
  for (const col of collections) {
    try {
      const snapshot = await db.collection(col).get();
      if (snapshot.empty) {
        console.log(`لا توجد بيانات في: ${col}`);
        continue;
      }

      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const headers = Object.keys(docs[0]).join(',');
      const rows = docs.map(doc => 
        Object.values(doc).map(val => {
          if (typeof val === 'object' && val !== null) {
            val = JSON.stringify(val);
          }
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
      );

      const csvContent = [headers, ...rows].join('\n');
      fs.writeFileSync(`${col}.csv`, csvContent);
      console.log(`تم تصدير: ${col}.csv بنجاح`);
    } catch (err) {
      console.log(`خطأ في الكولكشن ${col}:`, err.message);
    }
  }
}

exportData().catch(console.error);
