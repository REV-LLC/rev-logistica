import { Employee, EmployeeRole, PrismaClient, Role, Sku, SkuControlType, SkuUnit, User, Vehicle, Warehouse, WarehouseType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('test', 10);

  const users: Array<Pick<User, 'name' | 'email' | 'role'>> = [
    { name: 'Admin', email: 'admin@rev.com', role: Role.ADMIN },
    { name: 'Office User', email: 'office@rev.com', role: Role.OFFICE },
    { name: 'Driver User', email: 'driver@rev.com', role: Role.DRIVER },
  ];

  const createdUsers: User[] = [];
  for (const user of users) {
    const created = await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        name: user.name,
        email: user.email,
        passwordHash,
        role: user.role,
        active: true,
      },
    });
    createdUsers.push(created);
  }

  const adminUser = createdUsers.find((user) => user.role === Role.ADMIN)!;

  const ownerCompany = await prisma.owner.upsert({
    where: { name: 'REV Logistics' },
    update: {},
    create: {
      name: 'REV Logistics',
      active: true,
    },
  });

  const warehouseNames: Array<Pick<Warehouse, 'name' | 'type'>> = [
    { name: 'Main Warehouse', type: WarehouseType.OWN },
    { name: 'Bodega Norte', type: WarehouseType.OWN },
    { name: 'Bodega Aliada', type: WarehouseType.ALLY },
  ];

  const warehouses: Warehouse[] = [];
  for (const entry of warehouseNames) {
    const warehouse =
      (await prisma.warehouse.findFirst({ where: { name: entry.name } })) ??
      (await prisma.warehouse.create({
        data: {
          name: entry.name,
          type: entry.type,
          ownerCompanyId: ownerCompany.id,
          active: true,
        },
      }));
    warehouses.push(warehouse);
  }

  const warehouse = warehouses[0];

  const assetFamily = await prisma.assetFamily.upsert({
    where: { code: 'DEFAULT' },
    update: {},
    create: {
      code: 'DEFAULT',
      name: 'Default',
    },
  });

  const sku: Sku = await prisma.sku.upsert({
    where: { name: 'Default SKU' },
    update: {},
    create: {
      name: 'Default SKU',
      unit: SkuUnit.UNIT,
      controlType: SkuControlType.BULK,
      assetFamilyId: assetFamily.id,
      active: true,
    },
  });

  const asset =
    (await prisma.asset.findFirst({ where: { serialOrEngine: 'SERIAL-001' } })) ??
    (await prisma.asset.create({
      data: {
        serialOrEngine: 'SERIAL-001',
        skuId: sku.id,
        assetFamilyId: assetFamily.id,
        internalNumber: 1,
        warehouseOwnerId: warehouse.id,
        warehouseCurrentId: warehouse.id,
        active: true,
      },
    }));

  const employees: Array<Pick<Employee, 'name' | 'role' | 'phone' | 'email'>> = [
    { name: 'Carlos Rios', role: EmployeeRole.DRIVER, phone: '3000000001', email: 'carlos@rev.com' },
    { name: 'Marta Diaz', role: EmployeeRole.DRIVER, phone: '3000000002', email: 'marta@rev.com' },
    { name: 'Luis Perez', role: EmployeeRole.OTHER, phone: '3000000003', email: 'luis@rev.com' },
  ];

  const createdEmployees: Employee[] = [];
  for (const employee of employees) {
    const existing = await prisma.employee.findFirst({
      where: { email: employee.email ?? undefined },
    });
    const created = existing
      ? existing
      : await prisma.employee.create({
          data: {
            name: employee.name,
            role: employee.role,
            phone: employee.phone ?? null,
            email: employee.email ?? null,
            active: true,
          },
        });
    createdEmployees.push(created);
  }

  const vehicles: Array<Pick<Vehicle, 'plate' | 'brand' | 'model' | 'type' | 'capacity'>> = [
    { plate: 'AAA111', brand: 'Foton', model: 'Aumark', type: 'Camion', capacity: '2t' },
    { plate: 'BBB222', brand: 'Chevrolet', model: 'NKR', type: 'Camion', capacity: '1.5t' },
    { plate: 'CCC333', brand: 'Toyota', model: 'Hilux', type: 'Camioneta', capacity: '1t' },
  ];

  const createdVehicles: Vehicle[] = [];
  for (const vehicle of vehicles) {
    const created = await prisma.vehicle.upsert({
      where: { plate: vehicle.plate },
      update: {},
      create: {
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        type: vehicle.type,
        capacity: vehicle.capacity,
        active: true,
      },
    });
    createdVehicles.push(created);
  }

  if (createdEmployees.length && createdVehicles.length) {
    const pairs = [
      [createdEmployees[0], createdVehicles[0]],
      [createdEmployees[1], createdVehicles[1]],
    ];
    for (const [employee, vehicle] of pairs) {
      await prisma.employeeVehicle.upsert({
        where: {
          employeeId_vehicleId: {
            employeeId: employee.id,
            vehicleId: vehicle.id,
          },
        },
        update: { active: true },
        create: {
          employeeId: employee.id,
          vehicleId: vehicle.id,
          active: true,
        },
      });
    }
  }

  const customer =
    (await prisma.customer.findFirst({ where: { name: 'Acme' } })) ??
    (await prisma.customer.create({
      data: {
        name: 'Acme',
        active: true,
      },
    }));

  const worksite =
    (await prisma.worksite.findFirst({ where: { name: 'Worksite 1' } })) ??
    (await prisma.worksite.create({
      data: {
        name: 'Worksite 1',
        address: 'Default address',
        active: true,
      },
    }));

  const customerWorksite = await prisma.customerWorksite.upsert({
    where: {
      customerId_worksiteId: {
        customerId: customer.id,
        worksiteId: worksite.id,
      },
    },
    update: {},
    create: {
      customerId: customer.id,
      worksiteId: worksite.id,
      alias: 'Primary',
      active: true,
    },
  });

  console.log({
    adminUserId: adminUser.id,
    userIds: createdUsers.map((user) => user.id),
    warehouseId: warehouse.id,
    warehouseIds: warehouses.map((entry) => entry.id),
    skuId: sku.id,
    assetId: asset.id,
    assetFamilyId: assetFamily.id,
    employeeIds: createdEmployees.map((employee) => employee.id),
    vehicleIds: createdVehicles.map((vehicle) => vehicle.id),
    customerId: customer.id,
    worksiteId: worksite.id,
    customerWorksiteId: customerWorksite.id,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
