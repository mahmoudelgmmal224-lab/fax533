// db.js - طبقة قاعدة البيانات المحلية باستخدام IndexedDB
// نظام فاكسات اللواء الجوي 533 - نسخة الهاتف

const DB_NAME = 'FaxSystem533';
const DB_VERSION = 1;
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const d = e.target.result;

      // جدول الوارد
      if (!d.objectStoreNames.contains('incoming')) {
        const inc = d.createObjectStore('incoming', { keyPath: 'id', autoIncrement: true });
        inc.createIndex('fax_number', 'fax_number');
        inc.createIndex('received_date', 'received_date');
        inc.createIndex('status', 'status');
        inc.createIndex('is_archived', 'is_archived');
        inc.createIndex('sender_entity', 'sender_entity');
        inc.createIndex('department', 'department');
      }

      // جدول الصادر
      if (!d.objectStoreNames.contains('outgoing')) {
        const out = d.createObjectStore('outgoing', { keyPath: 'id', autoIncrement: true });
        out.createIndex('fax_number', 'fax_number', { unique: true });
        out.createIndex('sent_date', 'sent_date');
        out.createIndex('send_status', 'send_status');
        out.createIndex('is_archived', 'is_archived');
        out.createIndex('recipient_entity', 'recipient_entity');
      }

      // جدول سجل النشاط
      if (!d.objectStoreNames.contains('activity')) {
        const act = d.createObjectStore('activity', { keyPath: 'id', autoIncrement: true });
        act.createIndex('created_at', 'created_at');
      }
    };

    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function nowStr() {
  return new Date().toLocaleString('ar-EG');
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// سجل النشاط
async function logActivity(action, type, id, desc) {
  const d = await openDB();
  const tx = d.transaction('activity', 'readwrite');
  tx.objectStore('activity').add({
    action_type: action,
    target_type: type,
    target_id: id,
    description: desc,
    created_at: nowStr()
  });
}

// ============ الوارد ============
async function addIncoming(data) {
  const d = await openDB();
  const tx = d.transaction('incoming', 'readwrite');
  data.created_at = nowStr();
  data.updated_at = nowStr();
  data.is_archived = 0;
  const req = tx.objectStore('incoming').add(data);
  return new Promise((res, rej) => {
    req.onsuccess = async (e) => {
      await logActivity('إضافة', 'وارد', e.target.result, `إضافة فاكس وارد رقم ${data.fax_number}`);
      res(e.target.result);
    };
    req.onerror = (e) => rej(e.target.error);
  });
}

async function updateIncoming(id, data) {
  const d = await openDB();
  const tx = d.transaction('incoming', 'readwrite');
  const store = tx.objectStore('incoming');
  return new Promise((res, rej) => {
    const getReq = store.get(id);
    getReq.onsuccess = async (e) => {
      const existing = e.target.result;
      const updated = { ...existing, ...data, id, updated_at: nowStr() };
      const putReq = store.put(updated);
      putReq.onsuccess = async () => {
        await logActivity('تعديل', 'وارد', id, `تعديل فاكس وارد رقم ${updated.fax_number}`);
        res(true);
      };
      putReq.onerror = (e) => rej(e.target.error);
    };
    getReq.onerror = (e) => rej(e.target.error);
  });
}

async function archiveIncoming(id, archived) {
  const d = await openDB();
  return updateIncoming(id, { is_archived: archived ? 1 : 0, status: archived ? 'مؤرشف' : 'تم الإنجاز' })
    .then(() => logActivity(archived ? 'أرشفة' : 'استرجاع', 'وارد', id, archived ? 'أرشفة فاكس وارد' : 'استرجاع فاكس وارد'));
}

async function deleteIncoming(id) {
  const d = await openDB();
  const tx = d.transaction('incoming', 'readwrite');
  const getReq = tx.objectStore('incoming').get(id);
  return new Promise((res, rej) => {
    getReq.onsuccess = async (e) => {
      const fax = e.target.result;
      const tx2 = d.transaction('incoming', 'readwrite');
      const delReq = tx2.objectStore('incoming').delete(id);
      delReq.onsuccess = async () => {
        await logActivity('حذف', 'وارد', id, `حذف فاكس وارد رقم ${fax?.fax_number || id}`);
        res(true);
      };
      delReq.onerror = (e) => rej(e.target.error);
    };
    getReq.onerror = (e) => rej(e.target.error);
  });
}

async function getAllIncoming(filters = {}) {
  const d = await openDB();
  const tx = d.transaction('incoming', 'readonly');
  const store = tx.objectStore('incoming');
  return new Promise((res, rej) => {
    const req = store.getAll();
    req.onsuccess = (e) => {
      let rows = e.target.result;
      if (filters.archived !== undefined) rows = rows.filter(r => r.is_archived === (filters.archived ? 1 : 0));
      if (filters.status) rows = rows.filter(r => r.status === filters.status);
      if (filters.department) rows = rows.filter(r => (r.department || '').includes(filters.department));
      if (filters.fax_number) rows = rows.filter(r => (r.fax_number || '').includes(filters.fax_number));
      if (filters.sender_entity) rows = rows.filter(r => (r.sender_entity || '').toLowerCase().includes(filters.sender_entity.toLowerCase()));
      if (filters.date_from) rows = rows.filter(r => r.received_date >= filters.date_from);
      if (filters.date_to) rows = rows.filter(r => r.received_date <= filters.date_to);
      if (filters.date) rows = rows.filter(r => r.received_date === filters.date);
      rows.sort((a, b) => b.id - a.id);
      res(rows);
    };
    req.onerror = (e) => rej(e.target.error);
  });
}

async function getIncomingById(id) {
  const d = await openDB();
  const tx = d.transaction('incoming', 'readonly');
  return new Promise((res, rej) => {
    const req = tx.objectStore('incoming').get(id);
    req.onsuccess = (e) => res(e.target.result);
    req.onerror = (e) => rej(e.target.error);
  });
}

// ============ الصادر ============
let outgoingCounter = null;

async function getNextOutgoingNumber() {
  const rows = await getAllOutgoing({});
  const year = new Date().getFullYear();
  const yearRows = rows.filter(r => (r.fax_number || '').includes(String(year)));
  const max = yearRows.reduce((m, r) => {
    const parts = (r.fax_number || '').split('-');
    const n = parseInt(parts[parts.length - 1]) || 0;
    return Math.max(m, n);
  }, 0);
  return `OUT-${year}-${String(max + 1).padStart(4, '0')}`;
}

async function addOutgoing(data) {
  const d = await openDB();
  const tx = d.transaction('outgoing', 'readwrite');
  data.created_at = nowStr();
  data.updated_at = nowStr();
  data.is_archived = 0;
  const req = tx.objectStore('outgoing').add(data);
  return new Promise((res, rej) => {
    req.onsuccess = async (e) => {
      await logActivity('إضافة', 'صادر', e.target.result, `إضافة فاكس صادر رقم ${data.fax_number}`);
      res({ id: e.target.result, fax_number: data.fax_number });
    };
    req.onerror = (e) => rej(e.target.error);
  });
}

async function updateOutgoing(id, data) {
  const d = await openDB();
  const tx = d.transaction('outgoing', 'readwrite');
  const store = tx.objectStore('outgoing');
  return new Promise((res, rej) => {
    const getReq = store.get(id);
    getReq.onsuccess = async (e) => {
      const existing = e.target.result;
      const updated = { ...existing, ...data, id, updated_at: nowStr() };
      const putReq = store.put(updated);
      putReq.onsuccess = async () => {
        await logActivity('تعديل', 'صادر', id, `تعديل فاكس صادر`);
        res(true);
      };
      putReq.onerror = (e) => rej(e.target.error);
    };
    getReq.onerror = (e) => rej(e.target.error);
  });
}

async function archiveOutgoing(id, archived) {
  return updateOutgoing(id, { is_archived: archived ? 1 : 0 })
    .then(() => logActivity(archived ? 'أرشفة' : 'استرجاع', 'صادر', id, archived ? 'أرشفة فاكس صادر' : 'استرجاع فاكس صادر'));
}

async function deleteOutgoing(id) {
  const d = await openDB();
  const tx = d.transaction('outgoing', 'readonly');
  const getReq = tx.objectStore('outgoing').get(id);
  return new Promise((res, rej) => {
    getReq.onsuccess = async (e) => {
      const fax = e.target.result;
      const tx2 = d.transaction('outgoing', 'readwrite');
      const delReq = tx2.objectStore('outgoing').delete(id);
      delReq.onsuccess = async () => {
        await logActivity('حذف', 'صادر', id, `حذف فاكس صادر رقم ${fax?.fax_number || id}`);
        res(true);
      };
      delReq.onerror = (e) => rej(e.target.error);
    };
    getReq.onerror = (e) => rej(e.target.error);
  });
}

async function getAllOutgoing(filters = {}) {
  const d = await openDB();
  const tx = d.transaction('outgoing', 'readonly');
  return new Promise((res, rej) => {
    const req = tx.objectStore('outgoing').getAll();
    req.onsuccess = (e) => {
      let rows = e.target.result;
      if (filters.archived !== undefined) rows = rows.filter(r => r.is_archived === (filters.archived ? 1 : 0));
      if (filters.send_status) rows = rows.filter(r => r.send_status === filters.send_status);
      if (filters.fax_number) rows = rows.filter(r => (r.fax_number || '').includes(filters.fax_number));
      if (filters.recipient_entity) rows = rows.filter(r => (r.recipient_entity || '').toLowerCase().includes(filters.recipient_entity.toLowerCase()));
      if (filters.date_from) rows = rows.filter(r => r.sent_date >= filters.date_from);
      if (filters.date_to) rows = rows.filter(r => r.sent_date <= filters.date_to);
      if (filters.date) rows = rows.filter(r => r.sent_date === filters.date);
      rows.sort((a, b) => b.id - a.id);
      res(rows);
    };
    req.onerror = (e) => rej(e.target.error);
  });
}

async function getOutgoingById(id) {
  const d = await openDB();
  const tx = d.transaction('outgoing', 'readonly');
  return new Promise((res, rej) => {
    const req = tx.objectStore('outgoing').get(id);
    req.onsuccess = (e) => res(e.target.result);
    req.onerror = (e) => rej(e.target.error);
  });
}

// ============ سجل النشاط ============
async function getActivityLog(limit = 100) {
  const d = await openDB();
  const tx = d.transaction('activity', 'readonly');
  return new Promise((res, rej) => {
    const req = tx.objectStore('activity').getAll();
    req.onsuccess = (e) => {
      const rows = e.target.result.sort((a, b) => b.id - a.id).slice(0, limit);
      res(rows);
    };
    req.onerror = (e) => rej(e.target.error);
  });
}

// ============ لوحة التحكم ============
async function getDashboardStats() {
  const today = todayStr();
  const allIn = await getAllIncoming({});
  const allOut = await getAllOutgoing({});
  const activity = await getActivityLog(15);

  const incomingToday = allIn.filter(r => r.received_date === today && !r.is_archived).length;
  const outgoingToday = allOut.filter(r => r.sent_date === today && !r.is_archived).length;
  const incomingTotal = allIn.filter(r => !r.is_archived).length;
  const outgoingTotal = allOut.filter(r => !r.is_archived).length;
  const archivedCount = allIn.filter(r => r.is_archived).length + allOut.filter(r => r.is_archived).length;
  const openCount = allIn.filter(r => !r.is_archived && ['جديد','قيد المعالجة'].includes(r.status)).length;

  return { incomingToday, outgoingToday, incomingTotal, outgoingTotal, archivedCount, openCount, recentActivity: activity };
}

// ============ النسخ الاحتياطي ============
async function exportBackup() {
  const allIn = await getAllIncoming({});
  const allOut = await getAllOutgoing({});
  const activity = await getActivityLog(9999);
  const backup = {
    version: 1,
    exported_at: nowStr(),
    incoming: allIn,
    outgoing: allOut,
    activity
  };
  return JSON.stringify(backup, null, 2);
}

async function importBackup(jsonStr) {
  const data = JSON.parse(jsonStr);
  const d = await openDB();

  // مسح البيانات القديمة وإدراج الجديدة
  await new Promise((res, rej) => {
    const tx = d.transaction(['incoming', 'outgoing', 'activity'], 'readwrite');
    tx.objectStore('incoming').clear();
    tx.objectStore('outgoing').clear();
    tx.objectStore('activity').clear();
    tx.oncomplete = () => res();
    tx.onerror = (e) => rej(e.target.error);
  });

  for (const row of (data.incoming || [])) {
    const tx = d.transaction('incoming', 'readwrite');
    tx.objectStore('incoming').put(row);
    await new Promise(res => tx.oncomplete = res);
  }
  for (const row of (data.outgoing || [])) {
    const tx = d.transaction('outgoing', 'readwrite');
    tx.objectStore('outgoing').put(row);
    await new Promise(res => tx.oncomplete = res);
  }

  await logActivity('استيراد نسخة', 'نظام', null, 'استيراد نسخة احتياطية بنجاح');
  return true;
}

// تصدير الدوال
window.FaxDB = {
  openDB, todayStr, nowStr,
  addIncoming, updateIncoming, archiveIncoming, deleteIncoming, getAllIncoming, getIncomingById,
  addOutgoing, updateOutgoing, archiveOutgoing, deleteOutgoing, getAllOutgoing, getOutgoingById,
  getNextOutgoingNumber, getActivityLog, getDashboardStats, exportBackup, importBackup
};
