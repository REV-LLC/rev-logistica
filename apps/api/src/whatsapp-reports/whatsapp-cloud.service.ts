import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import sharp from 'sharp';
import type { EquipmentReplyOptions } from './whatsapp-report.types';
import { whatsappReplyPayload } from './whatsapp-menu';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
@Injectable()
export class WhatsappCloudService {
  private config() {
    const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const version = process.env.WHATSAPP_API_VERSION?.trim();
    if (!token || !phoneNumberId || !version || !/^v\d+\.\d+$/.test(version)) {
      throw new ServiceUnavailableException('WhatsApp Cloud is not configured');
    }
    return {
      token,
      phoneNumberId,
      base: `https://graph.facebook.com/${version}`,
    };
  }
  async reply(
    phone: string,
    text: string,
    kind: string = 'TEXT',
    confirmationMessageId?: string,
    options?: EquipmentReplyOptions,
  ) {
    const config = this.config();
    const response = await fetch(
      `${config.base}/${config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          whatsappReplyPayload(
            phone,
            text,
            kind,
            confirmationMessageId,
            options,
          ),
        ),
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      },
    );
    if (!response.ok)
      throw new ServiceUnavailableException(
        `WhatsApp reply HTTP ${response.status}`,
      );
  }
  async audio(mediaId: string) {
    if (!/^\d{1,100}$/.test(mediaId)) throw new Error('Invalid audio media id');
    const config = this.config();
    const meta = await fetch(
      `${config.base}/${mediaId}?phone_number_id=${config.phoneNumberId}`,
      {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      },
    );
    if (!meta.ok)
      throw new ServiceUnavailableException(
        'El audio no está disponible en WhatsApp. Solicita que lo reenvíen.',
      );
    const data = (await meta.json()) as {
      url?: string;
      mime_type?: string;
      file_size?: number;
    };
    const mime = data.mime_type?.split(';')[0].trim().toLowerCase() ?? '';
    const extensions: Record<string, string> = {
      'audio/aac': 'aac',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/amr': 'amr',
      'audio/ogg': 'ogg',
    };
    const max = 16 * 1024 * 1024;
    if (
      !extensions[mime] ||
      (data.file_size !== undefined &&
        (!Number.isFinite(data.file_size) ||
          data.file_size < 0 ||
          data.file_size > max))
    )
      throw new Error(
        'Audio must be AAC, MP4, MP3, AMR or OGG/Opus, up to 16 MB',
      );
    const url = new URL(data.url ?? '');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !['lookaside.fbsbx.com', 'facebook.com', 'fbcdn.net'].some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    )
      throw new Error('Invalid Meta audio host');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (!response.ok || !response.body)
      throw new ServiceUnavailableException(
        'No se pudo descargar el audio. Intenta de nuevo o solicita que lo reenvíen.',
      );
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > max) throw new Error('Audio too large');
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const valid =
      mime === 'audio/ogg'
        ? buffer.subarray(0, 4).toString() === 'OggS' &&
          buffer.subarray(0, 512).includes(Buffer.from('OpusHead'))
        : mime === 'audio/mp4'
          ? buffer.subarray(4, 8).toString() === 'ftyp'
          : mime === 'audio/amr'
            ? buffer.subarray(0, 5).toString() === '#!AMR'
            : mime === 'audio/aac'
              ? buffer.length > 1 &&
                buffer[0] === 0xff &&
                (buffer[1] & 0xf6) === 0xf0
              : buffer.subarray(0, 3).toString() === 'ID3' ||
                (buffer.length > 1 &&
                  buffer[0] === 0xff &&
                  (buffer[1] & 0xe0) === 0xe0);
    if (!valid) throw new Error('Invalid audio content');
    return {
      buffer,
      mimetype: mime === 'audio/ogg' ? 'audio/ogg; codecs=opus' : mime,
      filename: `nota-de-voz.${extensions[mime]}`,
    };
  }
  async photo(mediaId: string) {
    if (!/^\d+$/.test(mediaId)) throw new Error('Invalid media id');
    const config = this.config();
    const metadataResponse = await fetch(
      `${config.base}/${mediaId}?phone_number_id=${config.phoneNumberId}`,
      {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      },
    );
    if (!metadataResponse.ok)
      throw new ServiceUnavailableException(
        `WhatsApp media HTTP ${metadataResponse.status}`,
      );
    const metadata = (await metadataResponse.json()) as {
      url?: string;
      mime_type?: string;
      file_size?: number;
    };
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(
        metadata.mime_type ?? '',
      ) ||
      (metadata.file_size ?? 0) > MAX_PHOTO_BYTES
    ) {
      throw new Error('Photo must be JPEG, PNG or WEBP, up to 5 MB');
    }
    const url = new URL(metadata.url ?? '');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !['lookaside.fbsbx.com', 'facebook.com', 'fbcdn.net'].some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    ) {
      throw new Error('Invalid Meta media host');
    }
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (!response.ok || !response.body)
      throw new ServiceUnavailableException('Photo download failed');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_PHOTO_BYTES) {
        await response.body.cancel().catch(() => undefined);
        throw new Error('Photo too large');
      }
      chunks.push(Buffer.from(chunk));
    }
    // Decode to validate image content and strip EXIF before storage or model input.
    const buffer = await sharp(Buffer.concat(chunks), {
      limitInputPixels: 25000000,
    })
      .rotate()
      .jpeg({ quality: 90 })
      .toBuffer();
    return {
      buffer,
      mimetype: 'image/jpeg',
      originalname: `whatsapp-${mediaId}.jpg`,
      size: buffer.length,
    };
  }
}
