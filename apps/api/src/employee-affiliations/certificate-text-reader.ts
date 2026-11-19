import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
export class CertificateReadError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}
@Injectable()
export class CertificateTextReader {
  private run(command: string, args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) =>
      execFile(
        command,
        args,
        {
          cwd,
          timeout: 15000,
          killSignal: 'SIGKILL',
          maxBuffer: 1024 * 1024,
          env: {
            PATH: process.env.PATH,
            HOME: cwd,
            LANG: 'C.UTF-8',
            OMP_THREAD_LIMIT: '1',
          },
        },
        (error, stdout) =>
          error
            ? reject(new CertificateReadError('UNREADABLE'))
            : resolve(stdout),
      ),
    );
  }
  async read(
    buffer: Buffer,
    mime: string,
    forceOcr = false,
  ): Promise<{ text: string; method: string }> {
    if (buffer.length > 10 * 1024 * 1024)
      throw new CertificateReadError('TOO_LARGE');
    if (
      !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(
        mime,
      )
    )
      throw new CertificateReadError('UNSUPPORTED');
    const directory = await mkdtemp(join(tmpdir(), 'rev-affiliation-'));
    try {
      if (mime === 'application/pdf') {
        if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-')))
          throw new CertificateReadError('UNREADABLE');
        const file = join(directory, 'certificate.pdf');
        await writeFile(file, buffer, { mode: 0o600 });
        const info = await this.run('pdfinfo', [file], directory),
          pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
        if (!pages) throw new CertificateReadError('UNREADABLE');
        if (pages > 4) throw new CertificateReadError('TOO_MANY_PAGES');
        if (!forceOcr) {
          const text = await this.run(
            'pdftotext',
            ['-layout', file, '-'],
            directory,
          );
          if (text.trim().length >= 100) return { text, method: 'PDF_TEXT' };
        }
        await this.run(
          'pdftoppm',
          [
            '-f',
            '1',
            '-l',
            String(pages),
            '-scale-to',
            '2000',
            '-png',
            file,
            join(directory, 'page'),
          ],
          directory,
        );
        const texts: string[] = [];
        for (const name of (await readdir(directory))
          .filter((n) => /^page-\d+\.png$/.test(n))
          .sort())
          texts.push(
            await this.run(
              'tesseract',
              [join(directory, name), 'stdout', '-l', 'spa', '--psm', '3'],
              directory,
            ),
          );
        return { text: texts.join('\n'), method: 'PDF_OCR' };
      }
      const image = await sharp(buffer, { limitInputPixels: 25000000 })
        .rotate()
        .resize(2200, 2200, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      const file = join(directory, 'certificate.png');
      await writeFile(file, image, { mode: 0o600 });
      return {
        text: await this.run(
          'tesseract',
          [file, 'stdout', '-l', 'spa', '--psm', '3'],
          directory,
        ),
        method: 'IMAGE_OCR',
      };
    } catch (error) {
      if (error instanceof CertificateReadError) throw error;
      throw new CertificateReadError('UNREADABLE');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
