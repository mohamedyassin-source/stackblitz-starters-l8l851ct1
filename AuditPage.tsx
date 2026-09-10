'use client';
import { useState, useEffect } from 'react';

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">سجل الحركات والأحداث (Neon Database)</h1>
      <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">
        سيتم ربط سجل الأحداث مباشرة بجدول Neon بعد إتمام عملية النقل بنجاح.
      </div>
    </div>
  );
}
