/// <reference types="jest" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

/**
 * Chạy chính file Apps Script dán vào sheet (`scripts/google-sheet/report-webhook.gs`) trên Node,
 * thay SpreadsheetApp / LockService... bằng bản giả — kiểm logic chọn tab, chọn dòng, thứ tự cột.
 */
const SCRIPT = readFileSync(join(__dirname, '../scripts/google-sheet/report-webhook.gs'), 'utf8');
const FIRST_DATA_ROW = 3;

interface Write {
  row: number;
  col: number;
  numRows: number;
  numCols: number;
  values: unknown[][];
}

/** Tab có `filledRows` dòng dữ liệu từ dòng 3; bên dưới là dòng mẫu trống tới `lastRow`. */
function fakeTab(
  name: string,
  filledRows: number,
  lastRow = 808,
  validation: unknown = null,
  validationFromRow = FIRST_DATA_ROW,
) {
  const writes: Write[] = [];
  const rowCount = lastRow - FIRST_DATA_ROW + 1;
  const columnBC = Array.from({ length: rowCount }, (_, index) =>
    index < filledRows ? ['13/10/2026', 'Ngọc Sơn'] : ['', ''],
  );
  // Luật ô chọn cột Tên chỉ gắn từ dòng `validationFromRow` trở xuống, như sheet thật hay bị.
  const nameRules = Array.from({ length: rowCount }, (_, index) => [
    FIRST_DATA_ROW + index >= validationFromRow ? validation : null,
  ]);
  return {
    writes,
    getName: () => name,
    getSheetId: () => 750845861,
    getLastRow: () => lastRow,
    getRange: (row: number, col: number, numRows = 1, numCols = 1) => ({
      getValues: () => columnBC,
      setValues: (values: unknown[][]) => writes.push({ row, col, numRows, numCols, values }),
      getDataValidations: () => nameRules,
    }),
  };
}

/**
 * Enum của Apps Script: mỗi lần đọc ra một đối tượng MỚI, chỉ giống nhau ở toString().
 * So bằng === với `SpreadsheetApp.DataValidationCriteria.*` luôn sai — bản giả giữ đúng tính chất đó.
 */
function appsScriptEnum(name: string) {
  return { toString: () => name };
}

interface LoadOptions {
  secret?: string;
  locked?: boolean;
  /** Dịch vụ nâng cao "Google Sheets API" (`Sheets`); bỏ trống = chưa thêm dịch vụ. */
  sheetsApi?: unknown;
}

function load(
  tabs: ReturnType<typeof fakeTab>[],
  { secret = 's3cret', locked = true, sheetsApi }: LoadOptions = {},
) {
  const lock = { tryLock: jest.fn(() => locked), releaseLock: jest.fn() };
  const context = {
    ...(sheetsApi ? { Sheets: sheetsApi } : {}),
    SpreadsheetApp: {
      getActive: () => ({ getSheets: () => tabs, getId: () => 'spreadsheet-copy' }),
      flush: jest.fn(),
      DataValidationCriteria: {
        VALUE_IN_LIST: appsScriptEnum('VALUE_IN_LIST'),
        VALUE_IN_RANGE: appsScriptEnum('VALUE_IN_RANGE'),
      },
    },
    ContentService: {
      createTextOutput: (text: string) => ({ text, setMimeType: () => ({ text }) }),
      MimeType: { JSON: 'json' },
    },
    LockService: { getScriptLock: () => lock },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (key: string) => (key === 'SECRET' ? secret : null) }),
    },
  } as Record<string, unknown>;
  createContext(context);
  runInContext(SCRIPT, context);

  const post = (body: unknown) => {
    const output = (context.doPost as (e: unknown) => { text: string })({
      postData: { contents: JSON.stringify(body) },
    });
    return JSON.parse(output.text) as Record<string, unknown>;
  };
  return { post, context, lock };
}

const row = {
  liveDate: '2026-10-13',
  staffName: 'Ngọc Sơn',
  shift: 'Sáng',
  liveType: 'Live mới',
  liveHours: '9h - 13h',
  team: 'Team 1',
  channel: 'Huyk.xuongchetac2',
  totalHours: 4,
  revenue: 19957700,
  viewCount: 5350,
  retentionSeconds: 20,
  orderCount: 11,
  impressionCount: 271340,
};

describe('Apps Script ghi báo cáo vào sheet', () => {
  it('ghi vào dòng ngay sau dòng cuối có dữ liệu (bỏ qua dòng mẫu trống), đúng 13 cột B → N', () => {
    const tab = fakeTab('BCDT T10/2026', 137);
    const { post, lock } = load([fakeTab('BCDT T9/2026', 200), tab]);

    const result = post({ secret: 's3cret', action: 'append', row });

    expect(result).toEqual({ ok: true, tab: 'BCDT T10/2026', row: 140 });
    expect(tab.writes).toHaveLength(1);
    const [write] = tab.writes;
    expect([write.row, write.col, write.numRows, write.numCols]).toEqual([140, 2, 1, 13]);
    const [date, ...rest] = write.values[0] as [Date, ...unknown[]];
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([2026, 10, 13]);
    expect(rest).toEqual([
      'Ngọc Sơn', 'Sáng', 'Live mới', '9h - 13h', 'Team 1', 'Huyk.xuongchetac2',
      4, 19957700, 5350, 20, 11, 271340,
    ]);
    expect(lock.tryLock).toHaveBeenCalled();
    expect(lock.releaseLock).toHaveBeenCalled();
  });

  it.each([' BCDT T10/2026', 'BCDT T10/26', 'bcdt  t10/2026 '])(
    'nhận tab tên "%s" (thừa dấu cách / năm 2 số)',
    (name) => {
      const tab = fakeTab(name, 0, 2);
      const { post } = load([tab]);

      expect(post({ secret: 's3cret', action: 'append', row })).toMatchObject({ ok: true, row: 3 });
    },
  );

  it('chưa có tab tháng → lỗi rõ ràng, không ghi gì', () => {
    const tab = fakeTab('BCDT T10/2026', 10);
    const { post } = load([tab]);

    expect(post({ secret: 's3cret', action: 'append', row: { ...row, liveDate: '2026-11-02' } })).toEqual({
      ok: false,
      error: 'Chưa có tab "BCDT T11/2026" trong file báo cáo',
    });
    expect(tab.writes).toHaveLength(0);
  });

  it('sai mã bí mật → từ chối, không ghi', () => {
    const tab = fakeTab('BCDT T10/2026', 10);
    const { post } = load([tab]);

    expect(post({ secret: 'sai', action: 'append', row })).toEqual({ ok: false, error: 'Sai mã bí mật' });
    expect(tab.writes).toHaveLength(0);
  });

  it('người khác đang ghi quá lâu → báo bận, không ghi đè', () => {
    const tab = fakeTab('BCDT T10/2026', 10);
    const { post } = load([tab], { locked: false });

    expect(post({ secret: 's3cret', action: 'append', row })).toEqual({
      ok: false,
      error: 'File báo cáo đang bận, thử lại sau ít phút',
    });
    expect(tab.writes).toHaveLength(0);
  });

  it('danh sách tên dạng liệt kê trực tiếp (như sheet thật, C2:C808) đọc được dù enum không ===', () => {
    const validation = {
      getCriteriaType: () => appsScriptEnum('VALUE_IN_LIST'),
      getCriteriaValues: () => [['Quang Huy', 'Công Huy', 'Ngọc Sơn'], true],
    };
    const { post } = load([fakeTab('BCDT T10/2026', 10, 808, validation)]);

    expect(post({ secret: 's3cret', action: 'staffNames', liveDate: '2026-10-13' })).toEqual({
      ok: true,
      tab: 'BCDT T10/2026',
      staffNames: ['Quang Huy', 'Công Huy', 'Ngọc Sơn'],
      nameRule: 'VALUE_IN_LIST',
    });
  });

  it('danh sách theo vùng ô: bỏ trống và trùng', () => {
    const names = { getValues: () => [['Ngọc Sơn'], [' Duy Nam '], [''], ['Ngọc Sơn']] };
    const validation = {
      getCriteriaType: () => appsScriptEnum('VALUE_IN_RANGE'),
      getCriteriaValues: () => [names, true],
    };
    const { post } = load([fakeTab('BCDT T10/2026', 10, 808, validation)]);

    expect(post({ secret: 's3cret', action: 'staffNames', liveDate: '2026-10-13' })).toMatchObject({
      staffNames: ['Ngọc Sơn', 'Duy Nam'],
      nameRule: 'VALUE_IN_RANGE',
    });
  });

  it('ô chọn chỉ gắn từ dòng 140 trở xuống vẫn tìm thấy (không giả định là C3)', () => {
    const validation = {
      getCriteriaType: () => appsScriptEnum('VALUE_IN_LIST'),
      getCriteriaValues: () => [['Linh Chi'], true],
    };
    const { post } = load([fakeTab('BCDT T10/2026', 137, 808, validation, 140)]);

    expect(post({ secret: 's3cret', action: 'staffNames', liveDate: '2026-10-13' })).toMatchObject({
      staffNames: ['Linh Chi'],
    });
  });

  it('cột Tên không có ô chọn, chưa thêm dịch vụ Sheets API → rỗng, nhắc thêm dịch vụ', () => {
    const { post } = load([fakeTab('BCDT T10/2026', 10)]);

    expect(post({ secret: 's3cret', action: 'staffNames', liveDate: '2026-10-13' })).toEqual({
      ok: true,
      tab: 'BCDT T10/2026',
      staffNames: [],
      nameRule: 'NONE — chưa thêm dịch vụ Google Sheets API',
    });
  });

  /**
   * Sheet thật: tab là Bảng "Bảng_27" vùng B1:Q808, cột "Tên" kiểu Danh sách thả xuống — chỉ đọc được
   * qua Sheets API. API bỏ trống chỉ số bằng 0, nên cột B (đầu Bảng) không có `columnIndex`.
   */
  function sheetsApiWithTable(names: string[]) {
    return {
      Spreadsheets: {
        get: jest.fn(() => ({
          sheets: [
            { properties: { sheetId: 1 } },
            {
              properties: { sheetId: 750845861 },
              tables: [
                {
                  range: { startColumnIndex: 1, endColumnIndex: 17 },
                  columnProperties: [
                    { dataValidationRule: { condition: { values: [{ userEnteredValue: 'x' }] } } },
                    {
                      columnIndex: 1,
                      dataValidationRule: {
                        condition: { values: names.map((name) => ({ userEnteredValue: name })) },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        })),
      },
    };
  }

  it('tab là Bảng (Table): đọc danh sách thả xuống của cột "Tên" qua Sheets API', () => {
    const sheetsApi = sheetsApiWithTable(['Quang Huy', 'Công Huy', 'Ngọc Sơn']);
    const { post } = load([fakeTab('BCDT T10/2026', 137)], { sheetsApi });

    expect(post({ secret: 's3cret', action: 'staffNames', liveDate: '2026-10-13' })).toEqual({
      ok: true,
      tab: 'BCDT T10/2026',
      staffNames: ['Quang Huy', 'Công Huy', 'Ngọc Sơn'],
      nameRule: 'TABLE',
    });
    expect(sheetsApi.Spreadsheets.get).toHaveBeenCalledWith('spreadsheet-copy', expect.any(Object));
  });

  it('có dịch vụ Sheets API nhưng tab không phải Bảng → rơi về ô chọn thường', () => {
    const sheetsApi = { Spreadsheets: { get: () => ({ sheets: [{ properties: { sheetId: 750845861 } }] }) } };
    const validation = {
      getCriteriaType: () => appsScriptEnum('VALUE_IN_LIST'),
      getCriteriaValues: () => [['Linh Chi'], true],
    };
    const { post } = load([fakeTab('BCDT T10/2026', 10, 808, validation)], { sheetsApi });

    expect(post({ secret: 's3cret', action: 'staffNames', liveDate: '2026-10-13' })).toMatchObject({
      staffNames: ['Linh Chi'],
      nameRule: 'VALUE_IN_LIST',
    });
  });

  it('mở URL trên trình duyệt (doGet) chỉ trả trạng thái, không lộ dữ liệu', () => {
    const { context } = load([]);
    const output = (context.doGet as () => { text: string })();

    expect(JSON.parse(output.text)).toEqual({ ok: true, service: 'live-report-webhook' });
  });
});
