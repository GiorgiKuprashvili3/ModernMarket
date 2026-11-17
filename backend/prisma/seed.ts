import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Roles and permissions are reference data required for the app to function.
// Idempotent: safe to run repeatedly.
const ROLES: Record<string, string> = {
  buyer: 'Registered buyer',
  seller: 'Approved or pending seller account',
  admin: 'Administrator with a configurable permission set',
  super_admin: 'Full administrator, manages other administrators and settings',
};

const PERMISSIONS: string[] = [
  'users.read',
  'users.block',
  'sellers.read',
  'sellers.approve',
  'sellers.suspend',
  'products.moderate',
  'categories.manage',
  'brands.manage',
  'orders.read',
  'orders.override',
  'disputes.manage',
  'refunds.manage',
  'commissions.manage',
  'invoices.read',
  'invoices.issue',
  'invoices.record_payment',
  'subscriptions.manage',
  'promotions.manage',
  'reviews.moderate',
  'analytics.read',
  'reports.export',
  'settings.manage',
  'audit.read',
  'admins.manage',
];

// super_admin gets everything; admin gets a sensible default set (adjustable later in the UI).
const ADMIN_DEFAULT: string[] = PERMISSIONS.filter((p) => p !== 'admins.manage' && p !== 'settings.manage');

async function main(): Promise<void> {
  for (const [key, description] of Object.entries(ROLES)) {
    await prisma.role.upsert({ where: { key }, update: { description }, create: { key, description } });
  }
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }

  const permissions = await prisma.permission.findMany();
  const byKey = new Map(permissions.map((p) => [p.key, p.id]));

  const grants: Record<string, string[]> = {
    super_admin: PERMISSIONS,
    admin: ADMIN_DEFAULT,
  };

  for (const [roleKey, keys] of Object.entries(grants)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    for (const key of keys) {
      const permissionId = byKey.get(key);
      if (permissionId === undefined) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  // Default platform settings (GEL-only transactions; commission default is overridable).
  const settings: Array<{ key: string; value: unknown; description: string }> = [
    { key: 'commission.default_percent', value: 10, description: 'Global default commission rate (percent)' },
    { key: 'orders.seller_response_hours', value: 48, description: 'Hours before an unanswered seller order auto-cancels' },
    { key: 'orders.auto_complete_days', value: 7, description: 'Days after delivery before auto-completion without dispute' },
    { key: 'invoices.due_days', value: 14, description: 'Days between invoice issue and due date' },
    { key: 'products.reapproval_price_change_percent', value: 30, description: 'Price change that triggers re-moderation' },
  ];
  for (const s of settings) {
    await prisma.platformSetting.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, value: s.value as never, description: s.description },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
