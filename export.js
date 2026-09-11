const admin = require('firebase-admin');
const fs = require('fs');
const serviceAccount = require('./firebase-service.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// اكتب أسماء المجموعات (Collections) الخاصة بك هنا داخل المصفوفة
const collections = ['users']; 

async function exportData() {
  for (const col of collections) {
    const snapshot = await db.collection(col).get();
    if (snapshot.empty) continue;

    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const headers = Object.keys(docs[0]).join(',');
    const rows = docs.map(doc => 
      Object.values(doc).map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
    );

    const csvContent = [headers, ...rows].join('\n');
    fs.writeFileSync(`${col}.csv`, csvContent);
    console.log(`تم إنشاء ملف ${col}.csv بنجاح`);
  }
}

exportData().catch(console.error);
