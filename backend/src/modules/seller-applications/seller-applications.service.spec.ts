import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { SellerApplicationsService } from './seller-applications.service';

function buildPrisma() {
  const prisma = {
    user: { findFirst: jest.fn(), findUnique: jest.fn() },
    role: { findUnique: jest.fn() },
    sellerProfile: { update: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn(), findFirst: jest.fn() },
    sellerApplication: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    sellerStore: { findUnique: jest.fn(), create: jest.fn() },
    userRole: { upsert: jest.fn() },
    emailOutbox: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

const dto = {
  sellerType: 'INDIVIDUAL' as const,
  legalName: 'Gio K',
  identificationNumber: '01234567890',
  phone: '+995 555 000 000',
  contactAddress: 'Tbilisi',
  storeName: 'My Store',
};

const ctx = { ip: '127.0.0.1' };

describe('SellerApplicationsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let audit: { log: jest.Mock };
  let crypto: { encrypt: jest.Mock; decrypt: jest.Mock };
  let service: SellerApplicationsService;

  beforeEach(() => {
    prisma = buildPrisma();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    crypto = { encrypt: jest.fn().mockReturnValue('v1:enc'), decrypt: jest.fn().mockReturnValue('01234567890') };
    service = new SellerApplicationsService(prisma as never, crypto as never, audit as never);
  });

  describe('submit', () => {
    const user = (over: Record<string, unknown> = {}) => ({
      id: 1n,
      email: 'a@example.com',
      locale: 'ka',
      emailVerifiedAt: new Date(),
      sellerProfile: null,
      ...over,
    });

    it('requires an 11-digit id for individuals', async () => {
      await expect(service.submit('u', { ...dto, identificationNumber: '123456789' }, ctx)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('requires a verified email', async () => {
      prisma.user.findFirst.mockResolvedValue(user({ emailVerifiedAt: null }));
      await expect(service.submit('u', dto, ctx)).rejects.toThrow(ForbiddenException);
    });

    it('rejects a second application while one is in review', async () => {
      prisma.user.findFirst.mockResolvedValue(user({ sellerProfile: { id: 2n, status: 'PENDING', applications: [] } }));
      await expect(service.submit('u', dto, ctx)).rejects.toThrow(ConflictException);
    });

    it('blocks suspended sellers from re-applying', async () => {
      prisma.user.findFirst.mockResolvedValue(user({ sellerProfile: { id: 2n, status: 'SUSPENDED', applications: [] } }));
      await expect(service.submit('u', dto, ctx)).rejects.toThrow(ForbiddenException);
    });

    it('stores the identification number encrypted, never in plaintext', async () => {
      prisma.user.findFirst.mockResolvedValue(user());
      prisma.sellerProfile.create.mockResolvedValue({ id: 2n });
      prisma.sellerApplication.create.mockResolvedValue({
        uuid: 'app-1',
        status: 'PENDING',
        storeName: 'My Store',
        revisionNo: 1,
        submittedAt: new Date(),
        rejectionReason: null,
      });
      await service.submit('u', dto, ctx);
      const data = (prisma.sellerProfile.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
      expect(data['identificationEnc']).toBe('v1:enc');
      expect(JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toContain('01234567890');
    });

    it('allows a rejected applicant to apply again as a new revision', async () => {
      prisma.user.findFirst.mockResolvedValue(
        user({ sellerProfile: { id: 2n, status: 'REJECTED', applications: [{ revisionNo: 1 }] } }),
      );
      prisma.sellerProfile.update.mockResolvedValue({ id: 2n });
      prisma.sellerApplication.create.mockResolvedValue({
        uuid: 'app-2',
        status: 'PENDING',
        storeName: 'My Store',
        revisionNo: 2,
        submittedAt: new Date(),
        rejectionReason: null,
      });
      await service.submit('u', dto, ctx);
      expect(prisma.sellerApplication.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ revisionNo: 2 }) }),
      );
    });
  });

  describe('approve', () => {
    const open = { id: 10n, uuid: 'app-1', status: 'PENDING', sellerProfileId: 2n, storeName: 'My Store', storeDescription: null };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ id: 99n });
      prisma.role.findUnique.mockResolvedValue({ id: 5n });
      prisma.sellerProfile.findUniqueOrThrow.mockResolvedValue({
        id: 2n,
        userId: 1n,
        store: null,
        user: { email: 'a@example.com', locale: 'en' },
      });
      prisma.sellerStore.findUnique.mockResolvedValue(null);
      prisma.sellerStore.create.mockImplementation(({ data }: { data: { slug: string } }) => Promise.resolve({ slug: data.slug }));
    });

    it('grants the seller role, creates the store and writes an audit entry', async () => {
      prisma.sellerApplication.findUnique.mockResolvedValue(open);
      const result = await service.approve('admin', 'app-1', ctx);
      expect(result.storeSlug).toBe('my-store');
      expect(prisma.userRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { userId: 1n, roleId: 5n } }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'seller_application.approved' }),
        expect.anything(),
      );
    });

    it('cannot decide an application twice', async () => {
      prisma.sellerApplication.findUnique.mockResolvedValue({ ...open, status: 'APPROVED' });
      await expect(service.approve('admin', 'app-1', ctx)).rejects.toThrow(ConflictException);
      expect(prisma.userRole.upsert).not.toHaveBeenCalled();
    });

    it('adds a random suffix when the slug is taken', async () => {
      prisma.sellerApplication.findUnique.mockResolvedValue(open);
      prisma.sellerStore.findUnique.mockResolvedValueOnce({ id: 1n }).mockResolvedValue(null);
      const result = await service.approve('admin', 'app-1', ctx);
      expect(result.storeSlug).toMatch(/^my-store-[a-z0-9]+$/);
    });
  });

  describe('reject', () => {
    it('records the reason on the application and in the audit log', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 99n });
      prisma.sellerApplication.findUnique.mockResolvedValue({
        id: 10n,
        uuid: 'app-1',
        status: 'UNDER_REVIEW',
        sellerProfileId: 2n,
        storeName: 'My Store',
      });
      prisma.sellerProfile.findUniqueOrThrow.mockResolvedValue({ id: 2n, user: { email: 'a@example.com', locale: 'ka' } });
      await service.reject('admin', 'app-1', 'Documents unreadable', ctx);
      expect(prisma.sellerApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'Documents unreadable' }) }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'seller_application.rejected', reason: 'Documents unreadable' }),
        expect.anything(),
      );
    });
  });

  describe('detail', () => {
    it('audits every view of the decrypted identification number', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 99n });
      prisma.sellerApplication.findUnique.mockResolvedValue({
        uuid: 'app-1',
        status: 'PENDING',
        storeName: 'S',
        storeDescription: null,
        revisionNo: 1,
        submittedAt: new Date(),
        rejectionReason: null,
        documents: [],
        sellerProfile: {
          uuid: 'sp-1',
          sellerType: 'INDIVIDUAL',
          legalName: 'Gio',
          identificationEnc: 'v1:enc',
          phone: '1',
          contactAddress: 'x',
          status: 'PENDING',
          user: { email: 'a@example.com' },
        },
      });
      const view = await service.detail('admin', 'app-1', ctx);
      expect(view.seller.identificationNumber).toBe('01234567890');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'seller_application.viewed_identification' }));
    });
  });
});
