import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
@Injectable()
export class FaceClientService {
  async extract(
    image: Buffer,
  ): Promise<{ vector: number[]; modelVersion: string }> {
    const url = process.env.FACE_SERVICE_URL;
    const token = process.env.FACE_SERVICE_TOKEN;
    if (!url || !token)
      throw new ServiceUnavailableException(
        'Verificación facial sin configurar',
      );
    const form = new FormData();
    form.append(
      'image',
      new Blob([new Uint8Array(image)], { type: 'image/jpeg' }),
      'face.jpg',
    );
    let response: globalThis.Response;
    try {
      response = await fetch(`${url.replace(/\/$/, '')}/extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo verificar el rostro. Intenta nuevamente.',
      );
    }
    if (response.status === 422) {
      const data = await response.json().catch(() => ({}));
      throw new BadRequestException(
        typeof data.detail === 'string'
          ? data.detail
          : 'Toma una foto clara, de frente y con un solo rostro',
      );
    }
    if (!response.ok)
      throw new ServiceUnavailableException(
        'Verificación facial temporalmente no disponible',
      );
    const data = await response.json();
    if (
      !Array.isArray(data.vector) ||
      data.vector.length !== 128 ||
      !data.vector.every(Number.isFinite) ||
      Math.hypot(...data.vector) === 0 ||
      typeof data.modelVersion !== 'string'
    )
      throw new ServiceUnavailableException('Respuesta facial inválida');
    return data;
  }
}
