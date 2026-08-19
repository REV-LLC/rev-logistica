import { TaskPriority, TaskReminderUnit, TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';

describe('TasksService assignment notifications', () => {
  const assignedTask = {
    id: 'task-1',
    title: 'Revisar equipo',
    description: null,
    bulkItemName: null,
    status: TaskStatus.OPEN,
    priority: TaskPriority.MEDIUM,
    dueDate: null,
    createdByUserId: 'creator-1',
    assignedToUserId: 'user-1',
    assignedToEmployeeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('synchronizes notifications when a task is created with a responsible user', async () => {
    const prisma = {
      task: { create: jest.fn().mockResolvedValue(assignedTask) },
    };
    const notifications = {
      syncTaskNotification: jest.fn().mockResolvedValue({ sent: 1 }),
    };
    const service = new TasksService(prisma as never, notifications as never);

    await service.createTask(
      {
        title: assignedTask.title,
        assignedToUserId: assignedTask.assignedToUserId,
      },
      assignedTask.createdByUserId,
    );

    expect(notifications.syncTaskNotification).toHaveBeenCalledWith(assignedTask.id, 'CREATED');
  });

  it('does not notify again when an unrelated task field changes', async () => {
    const prisma = {
      task: {
        findUnique: jest.fn().mockResolvedValue(assignedTask),
        update: jest.fn().mockResolvedValue({
          ...assignedTask,
          priority: TaskPriority.HIGH,
        }),
      },
    };
    const notifications = { syncTaskNotification: jest.fn().mockResolvedValue({ skipped: 1 }) };
    const service = new TasksService(prisma as never, notifications as never);

    await service.updateTask(assignedTask.id, { priority: TaskPriority.HIGH });

    expect(notifications.syncTaskNotification).toHaveBeenCalledWith(assignedTask.id, 'UPDATED');
  });

  it('stores the WhatsApp reminder frequency with the task', async () => {
    const prisma = {
      task: { create: jest.fn().mockResolvedValue(assignedTask) },
    };
    const notifications = {
      syncTaskNotification: jest.fn().mockResolvedValue({ sent: 1 }),
    };
    const service = new TasksService(prisma as never, notifications as never);

    await service.createTask(
      {
        title: assignedTask.title,
        assignedToUserId: assignedTask.assignedToUserId,
        reminderIntervalValue: 2,
        reminderIntervalUnit: TaskReminderUnit.HOURS,
      },
      assignedTask.createdByUserId,
    );

    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reminderIntervalValue: 2,
        reminderIntervalUnit: TaskReminderUnit.HOURS,
      }),
    });
  });

  it('rejects an incomplete reminder frequency', async () => {
    const prisma = { task: { create: jest.fn() } };
    const service = new TasksService(
      prisma as never,
      { syncTaskNotification: jest.fn() } as never,
    );

    await expect(
      service.createTask(
        { title: assignedTask.title, reminderIntervalValue: 2 },
        assignedTask.createdByUserId,
      ),
    ).rejects.toThrow('Reminder interval value and unit must be provided together');
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('removes asset links before deleting a task', async () => {
    const tx = {
      taskAsset: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      task: { delete: jest.fn().mockResolvedValue(assignedTask) },
    };
    const prisma = {
      task: { findUnique: jest.fn().mockResolvedValue({ id: assignedTask.id }) },
      $transaction: jest.fn((operation) => operation(tx)),
    };
    const service = new TasksService(prisma as never, { syncTaskNotification: jest.fn() } as never);

    await expect(service.deleteTask(assignedTask.id)).resolves.toEqual({ deleted: true });

    expect(tx.taskAsset.deleteMany).toHaveBeenCalledWith({ where: { taskId: assignedTask.id } });
    expect(tx.task.delete).toHaveBeenCalledWith({ where: { id: assignedTask.id } });
    expect(tx.taskAsset.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.task.delete.mock.invocationCallOrder[0],
    );
  });
});
