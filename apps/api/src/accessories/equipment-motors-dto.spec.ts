import { ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AssignEquipmentMotorDto,
  EditMotorDto,
} from './dto/equipment-motors.dto';
import { EquipmentConfigurationDto } from './dto/equipment-configuration.dto';

describe('Motor API boundaries', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const validate = (metatype: any, body: unknown) =>
    pipe.transform(body, { type: 'body', metatype });
  const equipmentId = randomUUID();
  const motor = {
    brand: 'Honda',
    powerHp: 6.5,
    model: 'GX',
    fuel: 'GASOLINA',
    compatibleEquipmentIds: [equipmentId],
  };
  it('requires HP and explicit unit compatibility on new motors', async () => {
    await expect(
      validate(AssignEquipmentMotorDto, { version: 0, newMotor: motor }),
    ).resolves.toBeDefined();
    for (const invalid of [
      { powerHp: undefined },
      { powerHp: 0 },
      { powerHp: 1.234 },
      { compatibleEquipmentIds: [] },
      { compatibleEquipmentIds: [equipmentId, equipmentId] },
      { fuel: 'DIESEL' },
    ]) {
      await expect(
        validate(AssignEquipmentMotorDto, {
          version: 0,
          newMotor: { ...motor, ...invalid },
        }),
      ).rejects.toThrow();
    }
  });
  it('requires the source assignment observed by the selector, including explicit null', async () => {
    const motorId = randomUUID();
    await expect(
      validate(AssignEquipmentMotorDto, { version: 0, motorId }),
    ).rejects.toThrow();
    await expect(
      validate(AssignEquipmentMotorDto, {
        version: 0,
        motorId,
        expectedSourceId: null,
      }),
    ).resolves.toBeDefined();
    await expect(
      validate(AssignEquipmentMotorDto, {
        version: 0,
        motorId,
        expectedSourceId: equipmentId,
      }),
    ).resolves.toBeDefined();
  });
  it('rejects assignment/configuration flags through the old component payload and motor editing route', async () => {
    await expect(
      validate(EquipmentConfigurationDto, {
        version: 0,
        entries: [],
        motor: { configuration: 'INTERCHANGEABLE' },
      }),
    ).rejects.toThrow();
    await expect(
      validate(EditMotorDto, {
        ...motor,
        version: 0,
        motorConfiguration: 'INTERCHANGEABLE',
      }),
    ).rejects.toThrow();
  });
});
