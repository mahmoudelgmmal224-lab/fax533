// sqlite-importer.js
// أداة قراءة ملف SQLite من الكمبيوتر مباشرة في المتصفح
// تستخدم مكتبة sql.js (WebAssembly)

const SQLiteImporter = {

  // تحميل مكتبة sql.js من CDN عند الحاجة
  _sqlJs: null,

  async loadSqlJs() {
    if (this._sqlJs) return this._sqlJs;
    return new Promise((resolve, reject) => {
      if (window.initSqlJs) {
        window.initSqlJs({
          locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
        }).then(SQL => {
          this._sqlJs = SQL;
          resolve(SQL);
        }).catch(reject);
      } else {
        reject(new Error('sql.js غير محمّل'));
      }
    });
  },

  // قراءة ملف .db وتحويله لبيانات JSON متوافقة مع الهاتف
  async importFromDbFile(file) {
    const SQL = await this.loadSqlJs();

    // قراءة الملف كـ ArrayBuffer
    const buffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(new Uint8Array(e.target.result));
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });

    // فتح قاعدة البيانات
    const db = new SQL.Database(buffer);

    // قراءة الوارد
    const incoming = [];
    try {
      const result = db.exec(`SELECT * FROM incoming_faxes`);
      if (result.length > 0) {
        const cols = result[0].columns;
        result[0].values.forEach(row => {
          const obj = {};
          cols.forEach((col, i) => obj[col] = row[i]);
          incoming.push({
            id: obj.id,
            fax_number: obj.fax_number || '',
            received_date: obj.received_date || '',
            received_time: obj.received_time || '',
            sender_entity: obj.sender_entity || '',
            subject: obj.subject || '',
            department: obj.department || '',
            priority: obj.priority || 'عادي',
            status: obj.status || 'جديد',
            notes: obj.notes || '',
            is_archived: obj.is_archived || 0,
            created_at: obj.created_at || '',
            updated_at: obj.updated_at || '',
            attachment_path: null, // المرفقات لا تنتقل
          });
        });
      }
    } catch(e) {
      console.warn('جدول incoming_faxes غير موجود أو فارغ');
    }

    // قراءة الصادر
    const outgoing = [];
    try {
      const result = db.exec(`SELECT * FROM outgoing_faxes`);
      if (result.length > 0) {
        const cols = result[0].columns;
        result[0].values.forEach(row => {
          const obj = {};
          cols.forEach((col, i) => obj[col] = row[i]);
          outgoing.push({
            id: obj.id,
            fax_number: obj.fax_number || '',
            sent_date: obj.sent_date || '',
            sent_time: obj.sent_time || '',
            recipient_entity: obj.recipient_entity || '',
            subject: obj.subject || '',
            department: obj.department || '',
            send_status: obj.send_status || 'قيد الإرسال',
            notes: obj.notes || '',
            is_archived: obj.is_archived || 0,
            created_at: obj.created_at || '',
            updated_at: obj.updated_at || '',
            attachment_path: null,
            send_proof_path: null,
          });
        });
      }
    } catch(e) {
      console.warn('جدول outgoing_faxes غير موجود أو فارغ');
    }

    // قراءة سجل النشاط
    const activity = [];
    try {
      const result = db.exec(`SELECT * FROM activity_log ORDER BY id DESC LIMIT 500`);
      if (result.length > 0) {
        const cols = result[0].columns;
        result[0].values.forEach(row => {
          const obj = {};
          cols.forEach((col, i) => obj[col] = row[i]);
          activity.push({
            id: obj.id,
            action_type: obj.action_type || '',
            target_type: obj.target_type || '',
            target_id: obj.target_id || null,
            description: obj.description || '',
            created_at: obj.created_at || '',
          });
        });
      }
    } catch(e) {
      console.warn('جدول activity_log غير موجود أو فارغ');
    }

    db.close();

    return {
      version: 1,
      exported_at: new Date().toLocaleString('ar-EG'),
      source: 'desktop-sqlite',
      incoming,
      outgoing,
      activity,
    };
  }
};

window.SQLiteImporter = SQLiteImporter;
