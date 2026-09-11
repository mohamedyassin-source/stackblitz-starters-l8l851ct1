const admin = require('firebase-admin');
const fs = require('fs');
const serviceAccount = require('./firebase-service.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function exportAllCollections() {
  // جلب كل أسماء الكولكشنز الموجودة في القاعدة تلقائياً
  const collections = await db.listCollections();
  
  if (collections.length === 0) {
    console.log('لم يتم العثور على أي Collections في قاعدة البيانات!');
    return;
  }

  for (const colRef of collections) {
    const colName = colRef.id;
    try {
      const snapshot = await colRef.get();
      if (snapshot.empty) {
        console.log(`الكولكشن فارغة: ${colName}`);
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
      fs.writeFileSync(`${colName}.csv`, csvContent);
      console.log(`تم تصدير: ${colName}.csv بنجاح`);
    } catch (err) {
      console.log(`خطأ في تصدير ${colName}:`, err.message);
    }
  }
}

exportAllCollections().catch(console.error);
