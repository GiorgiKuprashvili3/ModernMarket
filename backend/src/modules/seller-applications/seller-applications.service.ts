import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CryptoService } from '../../common/crypto/crypto.service';
import { slugify } from '../../common/utils/slug';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ClientContext } from '../auth/auth.service';
import { ListApplicationsQueryDto, SubmitSellerApplicationDto } from './dto/seller-application.dto';

export interface MyApplicationView {
  sellerStatus: string;
  application: {
    uuid: string;
    status: string;
    storeName: string;
    revisionNo: number;
    submittedAt: Date;
    rejectionReason: string | null;
  } | null;
}

@Injectable()
export class SellerApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ Applicant side

  async submit(userUuid: string, dto: SubmitSellerApplicationDto, ctx: ClientContext): Promise<MyApplicationView> {
    if (dto.sellerType === 'INDIVIDUAL' && dto.identificationNumber.length !== 11) {
      throw new BadRequestException('Individual sellers must provide an 11-digit personal identification number');
    }

    const user = await this.prisma.user.findFirst({
      where: { uuid: userUuid, deletedAt: null },
      include: { sellerProfile: { include: { applications: { orderBy: { revisionNo: 'desc' }, take: 1 } } } },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.emailVerifiedAt) throw new ForbiddenException('Verify your email address before applying');

    const profile = user.sellerProfile;
    if (profile) {
      if (profile.status === 'PENDING' || profile.status === 'UNDER_REVIEW') {
        throw new ConflictException('You already have an application waiting for review');
      }
      if (profile.status === 'APPROVED') throw new ConflictException('You are already an approved seller');
      if (profile.status === 'SUSPENDED') throw new ForbiddenException('This seller account is suspended');
      // REJECTED: allowed to apply again with corrected details.
    }

    const identificationEnc = this.crypto.encrypt(dto.identificationNumber);
    const nextRevision = (profile?.applications[0]?.revisionNo ?? 0) + 1;

    const application = await this.prisma.$transaction(async (tx) => {
      const sellerProfile = profile
        ? await tx.sellerProfile.update({
            where: { id: profile.id },
            data: {
              sellerType: dto.sellerType,
              legalName: dto.legalName,
              identificationEnc,
              phone: dto.phone,
              contactAddress: dto.contactAddress,
              status: 'PENDING',
            },
          })
        : await tx.sellerProfile.create({
            data: {
              userId: user.id,
              sellerType: dto.sellerType,
              legalName: dto.legalName,
              identificationEnc,
              phone: dto.phone,
              contactAddress: dto.contactAddress,
            },
          });

      const created = await tx.sellerApplication.create({
        data: {
          sellerProfileId: sellerProfile.id,
          storeName: dto.storeName,
          storeDescription: dto.storeDescription,
          revisionNo: nextRevision,
        },
      });

      await tx.emailOutbox.create({
        data: {
          toEmail: user.email,
          template: 'seller-application-received',
          locale: user.locale,
          payload: { storeName: dto.storeName },
        },
      });
      await this.audit.log(
        {
          actorId: user.id,
          actorRole: 'buyer',
          action: 'seller_application.submitted',
          entityType: 'seller_application',
          entityId: created.uuid,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return created;
    });

    return {
      sellerStatus: 'PENDING',
      application: this.toApplicantView(application),
    };
  }

  async mine(userUuid: string): Promise<MyApplicationView> {
    const profile = await this.prisma.sellerProfile.findFirst({
      where: { user: { uuid: userUuid } },
      include: { applications: { orderBy: { revisionNo: 'desc' }, take: 1 } },
    });
    if (!profile) return { sellerStatus: 'NONE', application: null };
    const latest = profile.applications[0];
    return {
      sellerStatus: profile.status,
      application: latest ? this.toApplicantView(latest) : null,
    };
  }

  // ------------------------------------------------------------------ Admin side

  async list(query: ListApplicationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SellerApplicationWhereInput = query.status ? { status: query.status } : {};

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.sellerApplication.count({ where }),
      this.prisma.sellerApplication.findMany({
        where,
        orderBy: { submittedAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { sellerProfile: { select: { uuid: true, sellerType: true, legalName: true } } },
      }),
    ]);

    return {
      page,
      limit,
      total,
      // The identification number is intentionally not part of list rows.
      items: rows.map((a) => ({
        uuid: a.uuid,
        status: a.status,
        storeName: a.storeName,
        revisionNo: a.revisionNo,
        submittedAt: a.submittedAt,
        seller: a.sellerProfile,
      })),
    };
  }

  /** Detail view includes the decrypted identification number; every view is audited. */
  async detail(adminUuid: string, applicationUuid: string, ctx: ClientContext) {
    const admin = await this.requireUser(adminUuid);
    const application = await this.prisma.sellerApplication.findUnique({
      where: { uuid: applicationUuid },
      include: { sellerProfile: { include: { user: { select: { email: true } } } }, documents: true },
    });
    if (!application) throw new NotFoundException('Application not found');

    await this.audit.log({
      actorId: admin.id,
      actorRole: 'admin',
      action: 'seller_application.viewed_identification',
      entityType: 'seller_application',
      entityId: application.uuid,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    const profile = application.sellerProfile;
    return {
      uuid: application.uuid,
      status: application.status,
      storeName: application.storeName,
      storeDescription: application.storeDescription,
      revisionNo: application.revisionNo,
      submittedAt: application.submittedAt,
      rejectionReason: application.rejectionReason,
      seller: {
        uuid: profile.uuid,
        email: profile.user.email,
        sellerType: profile.sellerType,
        legalName: profile.legalName,
        identificationNumber: profile.identificationEnc ? this.crypto.decrypt(profile.identificationEnc) : null,
        phone: profile.phone,
        contactAddress: profile.contactAddress,
        status: profile.status,
      },
      documents: application.documents.map((d) => ({
        uuid: d.uuid,
        docType: d.docType,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
      })),
    };
  }

  async markUnderReview(adminUuid: string, applicationUuid: string, ctx: ClientContext): Promise<void> {
    const admin = await this.requireUser(adminUuid);
    await this.prisma.$transaction(async (tx) => {
      const application = await this.loadOpenApplication(tx, applicationUuid, ['PENDING']);
      await tx.sellerApplication.update({ where: { id: application.id }, data: { status: 'UNDER_REVIEW' } });
      await tx.sellerProfile.update({ where: { id: application.sellerProfileId }, data: { status: 'UNDER_REVIEW' } });
      await this.audit.log(
        {
          actorId: admin.id,
          actorRole: 'admin',
          action: 'seller_application.under_review',
          entityType: 'seller_application',
          entityId: application.uuid,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });
  }

  async approve(adminUuid: string, applicationUuid: string, ctx: ClientContext): Promise<{ storeSlug: string }> {
    const admin = await this.requireUser(adminUuid);
    const sellerRole = await this.prisma.role.findUnique({ where: { key: 'seller' } });
    if (!sellerRole) throw new Error('Role "seller" not found. Run the database seed.');

    return this.prisma.$transaction(async (tx) => {
      const application = await this.loadOpenApplication(tx, applicationUuid, ['PENDING', 'UNDER_REVIEW']);
      const profile = await tx.sellerProfile.findUniqueOrThrow({
        where: { id: application.sellerProfileId },
        include: { user: true, store: true },
      });
      const now = new Date();

      await tx.sellerApplication.update({
        where: { id: application.id },
        data: { status: 'APPROVED', reviewedById: admin.id, reviewedAt: now, rejectionReason: null },
      });
      await tx.sellerProfile.update({
        where: { id: profile.id },
        data: { status: 'APPROVED', approvedAt: now, approvedById: admin.id, suspendedAt: null, suspendedReason: null },
      });
      // The seller role is only granted on approval, never at application time.
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: profile.userId, roleId: sellerRole.id } },
        update: {},
        create: { userId: profile.userId, roleId: sellerRole.id },
      });

      const store =
        profile.store ??
        (await tx.sellerStore.create({
          data: {
            sellerProfileId: profile.id,
            slug: await this.uniqueStoreSlug(tx, application.storeName),
            name: application.storeName,
            descriptionKa: application.storeDescription,
          },
        }));

      await tx.emailOutbox.create({
        data: {
          toEmail: profile.user.email,
          template: 'seller-approved',
          locale: profile.user.locale,
          payload: { storeName: application.storeName },
        },
      });
      await this.audit.log(
        {
          actorId: admin.id,
          actorRole: 'admin',
          action: 'seller_application.approved',
          entityType: 'seller_application',
          entityId: application.uuid,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
      return { storeSlug: store.slug };
    });
  }

  async reject(adminUuid: string, applicationUuid: string, reason: string, ctx: ClientContext): Promise<void> {
    const admin = await this.requireUser(adminUuid);
    await this.prisma.$transaction(async (tx) => {
      const application = await this.loadOpenApplication(tx, applicationUuid, ['PENDING', 'UNDER_REVIEW']);
      const profile = await tx.sellerProfile.findUniqueOrThrow({
        where: { id: application.sellerProfileId },
        include: { user: true },
      });
      const now = new Date();

      await tx.sellerApplication.update({
        where: { id: application.id },
        data: { status: 'REJECTED', reviewedById: admin.id, reviewedAt: now, rejectionReason: reason },
      });
      await tx.sellerProfile.update({ where: { id: profile.id }, data: { status: 'REJECTED' } });

      await tx.emailOutbox.create({
        data: {
          toEmail: profile.user.email,
          template: 'seller-rejected',
          locale: profile.user.locale,
          payload: { storeName: application.storeName, reason },
        },
      });
      await this.audit.log(
        {
          actorId: admin.id,
          actorRole: 'admin',
          action: 'seller_application.rejected',
          entityType: 'seller_application',
          entityId: application.uuid,
          reason,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });
  }

  // ------------------------------------------------------------------ Internals

  private async requireUser(uuid: string): Promise<{ id: bigint }> {
    const user = await this.prisma.user.findUnique({ where: { uuid }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Loads an application and guards against acting on one that was already decided. */
  private async loadOpenApplication(
    tx: Prisma.TransactionClient,
    uuid: string,
    allowed: Array<'PENDING' | 'UNDER_REVIEW'>,
  ) {
    const application = await tx.sellerApplication.findUnique({ where: { uuid } });
    if (!application) throw new NotFoundException('Application not found');
    if (!allowed.includes(application.status as 'PENDING' | 'UNDER_REVIEW')) {
      throw new ConflictException(`Application is already ${application.status.toLowerCase()}`);
    }
    return application;
  }

  private async uniqueStoreSlug(tx: Prisma.TransactionClient, storeName: string): Promise<string> {
    const base = slugify(storeName, 'store');
    let candidate = base;
    for (let attempt = 0; attempt < 5; attempt++) {
      const taken = await tx.sellerStore.findUnique({ where: { slug: candidate }, select: { id: true } });
      if (!taken) return candidate;
      candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }
    throw new ConflictException('Could not generate a unique store address; please retry');
  }

  private toApplicantView(a: {
    uuid: string;
    status: string;
    storeName: string;
    revisionNo: number;
    submittedAt: Date;
    rejectionReason: string | null;
  }) {
    return {
      uuid: a.uuid,
      status: a.status,
      storeName: a.storeName,
      revisionNo: a.revisionNo,
      submittedAt: a.submittedAt,
      rejectionReason: a.rejectionReason,
    };
  }
}
