/**
 * Web App nhận báo cáo "Kết thúc ca" từ LIVE_BE và ghi vào file báo cáo tổng
 * "QL&PT Livestreams Viễn Chí Bảo" (tab "BCDT T{tháng}/{năm}", cột B → O; cột O là link ảnh báo
 * cáo — nên đổi tiêu đề cột O của Bảng từ "Column 14" thành "Ảnh báo cáo").
 * Phía BE: src/session-reports/report-sheet/report-sheet.client.ts.
 *
 * CÀI ĐẶT — làm một lần, bằng tài khoản có quyền chỉnh sửa file:
 * 1. Mở file sheet → Tiện ích mở rộng → Apps Script. Xoá code mẫu, dán toàn bộ file này, bấm Lưu.
 *    Cột trái "Dịch vụ" → dấu + → chọn "Google Sheets API" → Thêm (để đọc ô chọn tên của Bảng).
 * 2. Biểu tượng bánh răng "Cài đặt dự án" → "Thuộc tính tập lệnh" → Thêm thuộc tính:
 *      SECRET = một chuỗi bí mật bất kỳ, TRÙNG với REPORT_SHEET_WEBHOOK_SECRET của LIVE_BE.
 * 3. Triển khai → Tùy chọn triển khai mới → bánh răng chọn "Ứng dụng web":
 *      Thực thi với tư cách: Tôi · Người có quyền truy cập: Bất kỳ ai → Triển khai → cấp quyền
 *      (Google báo "chưa xác minh" thì bấm Nâng cao → Đi tới ... → Cho phép).
 * 4. Copy "URL ứng dụng web" (đuôi /exec) vào REPORT_SHEET_WEBHOOK_URL của LIVE_BE.
 * Sửa code sau này: Triển khai → Quản lý các lần triển khai → bút chì → Phiên bản mới (URL giữ nguyên).
 *
 * Tab chọn theo tháng của ngày live, chấp nhận "BCDT T10/2026", "BCDT T10/26", thừa/thiếu dấu
 * cách. Chưa có tab tháng đó thì báo lỗi chứ không tự tạo — tab mới do đội vận hành chép từ mẫu.
 */

/** Dòng 1 là tiêu đề, dòng 2 là dòng tổng — dữ liệu bắt đầu từ dòng 3. */
const FIRST_DATA_ROW = 3;
/** Cột B "Ngày live". */
const COL_DATE = 2;
/** Cột C "Tên" — cũng là cột có ô chọn danh sách nhân sự. */
const COL_NAME = 3;
/** Số cột ghi: B → O (O = link ảnh báo cáo). */
const ROW_WIDTH = 14;
/** Hai người nộp cùng lúc: người sau chờ tối đa ngần này để không ghi đè cùng một dòng. */
const LOCK_WAIT_MS = 20000;

function doPost(e) {
  return respond_(function () {
    const body = JSON.parse(e.postData.contents);
    assertSecret_(body.secret);
    if (body.action === 'append') return appendReport_(body.row);
    if (body.action === 'staffNames') return staffNames_(body.liveDate);
    throw new Error('Action không hợp lệ: ' + body.action);
  });
}

/** Mở URL /exec trên trình duyệt để xem đã triển khai đúng chưa. Không trả dữ liệu nào. */
function doGet() {
  return respond_(function () {
    return { service: 'live-report-webhook' };
  });
}

function respond_(handler) {
  let body;
  try {
    body = Object.assign({ ok: true }, handler());
  } catch (err) {
    body = { ok: false, error: err && err.message ? err.message : String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function assertSecret_(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!expected) throw new Error('Apps Script chưa đặt thuộc tính SECRET');
  if (secret !== expected) throw new Error('Sai mã bí mật');
}

function parseLiveDate_(liveDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(liveDate || ''));
  if (!match) throw new Error('Ngày live phải là yyyy-MM-dd');
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function monthTab_(liveDate) {
  const date = parseLiveDate_(liveDate);
  const wanted = [
    'BCDTT' + date.month + '/' + date.year,
    'BCDTT' + date.month + '/' + String(date.year).slice(2),
  ];
  const sheet = SpreadsheetApp.getActive()
    .getSheets()
    .find(function (s) {
      return wanted.indexOf(s.getName().replace(/\s+/g, '').toUpperCase()) !== -1;
    });
  if (!sheet) {
    throw new Error('Chưa có tab "BCDT T' + date.month + '/' + date.year + '" trong file báo cáo');
  }
  return sheet;
}

/** Dòng ngay sau dòng cuối có Ngày hoặc Tên — dòng mẫu kẻ sẵn bên dưới vẫn trống giá trị. */
function nextEmptyRow_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return FIRST_DATA_ROW;
  const values = sheet
    .getRange(FIRST_DATA_ROW, COL_DATE, lastRow - FIRST_DATA_ROW + 1, 2)
    .getValues();
  let lastFilled = FIRST_DATA_ROW - 1;
  values.forEach(function (cells, index) {
    if (String(cells[0]).trim() || String(cells[1]).trim()) lastFilled = FIRST_DATA_ROW + index;
  });
  return lastFilled + 1;
}

function appendReport_(row) {
  if (!row) throw new Error('Thiếu dữ liệu báo cáo');
  const date = parseLiveDate_(row.liveDate);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) throw new Error('File báo cáo đang bận, thử lại sau ít phút');
  try {
    const sheet = monthTab_(row.liveDate);
    const target = nextEmptyRow_(sheet);
    sheet.getRange(target, COL_DATE, 1, ROW_WIDTH).setValues([
      [
        // 12h trưa: lệch múi giờ giữa script và file cũng không nhảy sang ngày khác.
        new Date(date.year, date.month - 1, date.day, 12),
        row.staffName,
        row.shift,
        row.liveType,
        row.liveHours,
        row.team,
        row.channel,
        row.totalHours,
        row.revenue,
        row.viewCount,
        row.retentionSeconds,
        row.orderCount,
        row.impressionCount,
        // BE cũ (chưa có ô ảnh) không gửi trường này — để ô trống thay vì chữ "undefined".
        row.imageUrl || '',
      ],
    ]);
    SpreadsheetApp.flush();
    return { tab: sheet.getName().trim(), row: target };
  } finally {
    lock.releaseLock();
  }
}

/** Luật ô chọn của cột "Tên": ô đầu tiên trong vùng dữ liệu có gắn luật (không giả định là C3). */
function nameRule_(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), FIRST_DATA_ROW);
  const rules = sheet
    .getRange(FIRST_DATA_ROW, COL_NAME, lastRow - FIRST_DATA_ROW + 1, 1)
    .getDataValidations();
  for (let i = 0; i < rules.length; i++) {
    if (rules[i][0]) return rules[i][0];
  }
  return null;
}

/**
 * Danh sách thả xuống của cột "Tên" khi tab là một Bảng (Table, vd "Bảng_27" của tab BCDT):
 * kiểu cột của Bảng không lộ ra qua SpreadsheetApp nên phải đọc bằng dịch vụ nâng cao
 * "Google Sheets API" (định danh `Sheets`). Chưa thêm dịch vụ hoặc cột không thuộc Bảng → null.
 */
function tableNameList_(sheet) {
  if (typeof Sheets === 'undefined') return null;
  const spreadsheet = Sheets.Spreadsheets.get(SpreadsheetApp.getActive().getId(), {
    fields:
      'sheets(properties.sheetId,tables(range,columnProperties(columnIndex,dataValidationRule)))',
  });
  const target = (spreadsheet.sheets || []).find(function (s) {
    return s.properties.sheetId === sheet.getSheetId();
  });
  const tables = (target && target.tables) || [];
  for (let t = 0; t < tables.length; t++) {
    // API bỏ trống các chỉ số bằng 0 — phải mặc định 0, không thì cột đầu Bảng bị bỏ sót.
    const start = tables[t].range.startColumnIndex || 0;
    const column = (tables[t].columnProperties || []).find(function (c) {
      return start + (c.columnIndex || 0) === COL_NAME - 1;
    });
    const condition = column && column.dataValidationRule && column.dataValidationRule.condition;
    if (condition && condition.values) {
      return condition.values.map(function (v) {
        return v.userEnteredValue;
      });
    }
  }
  return null;
}

/** Ô chọn thường (không phải Bảng) của cột "Tên". */
function classicNameList_(sheet) {
  const rule = nameRule_(sheet);
  // So theo TÊN loại luật: enum của Apps Script đọc hai lần ra hai đối tượng khác nhau,
  // so bằng === với SpreadsheetApp.DataValidationCriteria.* luôn sai (đã gặp 13/10/2026).
  const kind = rule ? String(rule.getCriteriaType()) : 'NONE';
  const args = rule ? rule.getCriteriaValues() : [];
  if (kind === 'VALUE_IN_LIST') {
    return { kind: kind, names: Array.isArray(args[0]) ? args[0] : String(args[0]).split(',') };
  }
  if (kind === 'VALUE_IN_RANGE') {
    return { kind: kind, names: [].concat.apply([], args[0].getValues()) };
  }
  return { kind: kind, names: [] };
}

function staffNames_(liveDate) {
  const sheet = monthTab_(liveDate);
  let names = tableNameList_(sheet);
  let source = 'TABLE';
  if (!names) {
    const classic = classicNameList_(sheet);
    names = classic.names;
    source =
      classic.kind === 'NONE' && typeof Sheets === 'undefined'
        ? 'NONE — chưa thêm dịch vụ Google Sheets API'
        : classic.kind;
  }
  const unique = [];
  names.forEach(function (name) {
    const trimmed = String(name).trim();
    if (trimmed && unique.indexOf(trimmed) === -1) unique.push(trimmed);
  });
  // `nameRule` để chẩn đoán khi danh sách rỗng: biết ngay tên lấy từ đâu / vì sao không có.
  return { tab: sheet.getName().trim(), staffNames: unique, nameRule: source };
}
