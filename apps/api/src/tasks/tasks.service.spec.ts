import { TaskPriority, TaskStatus } from '@prisma/client';
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

  afterEach(() => {
    delete process.env.PUBLIC_WEB_URL;
  });

  it('sends WhatsApp when a task is created with a responsible user', async () => {
    const prisma = {
      task: { create: jest.fn().mockResolvedValue(assignedTask) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          active: true,
          email: 'ana@example.com',
          employee: { name: 'Ana', lastName: 'Ruiz', phone: '3001234567' },
        }),
      },
    };
    const transport = {
      sendWhatsapp: jest.fn().mockResolvedValue({ sent: true }),
    };
    process.env.PUBLIC_WEB_URL = 'https://app.example.test/';
    const service = new TasksService(prisma as never, transport as never);

    await service.createTask(
      {
        title: assignedTask.title,
        assignedToUserId: assignedTask.assignedToUserId,
      },
      assignedTask.createdByUserId,
    );

    expect(transport.sendWhatsapp).toHaveBeenCalledWith('3001234567', {
      title: 'Nueva tarea asignada',
      body: 'Se te ha asignado la tarea “Revisar equipo”. Por favor, revisa la app.',
      recipientName: 'Ana Ruiz',
      link: 'https://app.example.test/tasks',
    });
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
    const transport = { sendWhatsapp: jest.fn() };
    const service = new TasksService(prisma as never, transport as never);

    await service.updateTask(assignedTask.id, { priority: TaskPriority.HIGH });

    expect(transport.sendWhatsapp).not.toHaveBeenCalled();
  });
});
