/// <reference types="jest" />

import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CloudinaryStorageService } from '../src/cloudinary/cloudinary-storage.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CreateSessionReportDto } from '../src/session-reports/dto/create-session-report.dto';
import { ReportSheetClient } from '../src/session-reports/report-sheet/report-sheet.client';
import { SessionReportsService } from '../src/session-reports/session-reports.service';

const IMAGE_URL =
  'https://res.cloudinary.com/jsmkvfyg/image/upload/v1/LIVE_VCB/session-reports/abc.jpg';

function file(patch: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    originalname: 'so-lieu-ca.png',
    mimetype: 'image/png',
    size: 200_000,
    buffer: Buffer.from('png'),
    ...patch,
  } as Express.Multer.File;
}

describe('Ảnh báo cáo kết thúc ca', () => {
  let service: SessionReportsService;
  const cloudinary = { uploadObject: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    cloudinary.uploadObject.mockResolvedValue({ storagePath: 'x', publicUrl: IMAGE_URL });
    const moduleRef = await Test.createTestingModule({
      providers: [
        SessionReportsService,
        { provide: PrismaService, useValue: {} },
        { provide: ReportSheetClient, useValue: {} },
        { provide: CloudinaryStorageService, useValue: cloudinary },
      ],
    }).compile();
    service = moduleRef.get(SessionReportsService);
  });

  describe('tải ảnh lên (POST /session-reports/upload-image)', () => {
    it('ảnh hợp lệ → lưu vào thư mục session-reports trên Cloudinary, trả link', async () => {
      await expect(service.uploadImage(file())).resolves.toEqual({ imageUrl: IMAGE_URL });

      const [path, , mime] = cloudinary.uploadObject.mock.calls[0] as [string, Buffer, string];
      expect(path).toMatch(/^session-reports\/[0-9a-f-]{36}\.png$/);
      expect(mime).toBe('image/png');
    });

    it.each([
      ['không gửi file', undefined, 'Vui lòng chọn ảnh báo cáo'],
      ['file PDF', file({ mimetype: 'application/pdf' }), 'Ảnh phải là JPG, PNG hoặc WEBP'],
      ['ảnh 11MB', file({ size: 11 * 1024 * 1024 }), 'Ảnh không được lớn hơn 10MB'],
    ])('%s → 400 "%s", không tải lên', async (_case, input, message) => {
      const promise = service.uploadImage(input);

      await expect(promise).rejects.toBeInstanceOf(BadRequestException);
      await expect(promise).rejects.toThrow(message);
      expect(cloudinary.uploadObject).not.toHaveBeenCalled();
    });
  });

  describe('nộp báo cáo bắt buộc kèm link ảnh', () => {
    const valid = {
      sessionId: '55555555-5555-4555-8555-555555555555',
      liveDate: '2026-10-13',
      staffName: 'Ngọc Sơn',
      shiftId: '11111111-1111-4111-8111-111111111111',
      liveTypeId: '22222222-2222-4222-8222-222222222222',
      teamId: '33333333-3333-4333-8333-333333333333',
      channelId: '44444444-4444-4444-8444-444444444444',
      totalHours: '4',
      revenue: '19957700',
      viewCount: '5350',
      retentionRate: '20',
      orderCount: '11',
      impressionCount: '271340',
      imageUrl: IMAGE_URL,
    };

    async function messages(patch: Record<string, unknown>): Promise<string[]> {
      const errors = await validate(plainToInstance(CreateSessionReportDto, { ...valid, ...patch }));
      return errors.flatMap((error) => Object.values(error.constraints ?? {}));
    }

    it('có link ảnh Cloudinary → hợp lệ', async () => {
      expect(await messages({})).toEqual([]);
    });

    it('thiếu ảnh → "Chọn ảnh báo cáo"', async () => {
      expect(await messages({ imageUrl: undefined })).toContain('Chọn ảnh báo cáo');
    });

    it.each(['https://evil.example.com/a.jpg', 'http://res.cloudinary.com/x/a.jpg'])(
      'link ảnh không phải Cloudinary https (%s) → bị chặn',
      async (imageUrl) => {
        expect(await messages({ imageUrl })).toContain('Ảnh báo cáo không hợp lệ');
      },
    );
  });
});
