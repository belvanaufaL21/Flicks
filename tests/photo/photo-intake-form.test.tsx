// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PhotoIntakeForm from '../../src/components/photo-intake/photo-intake-form';

const decode = vi.fn();
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

const PNG_HEADER = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

function validFile(name: string): File {
  return new File([PNG_HEADER], name, { type: 'image/png' });
}

describe('PhotoIntakeForm', () => {
  beforeEach(() => {
    decode.mockResolvedValue({ width: 512, height: 768, close: vi.fn() });
    createObjectURL.mockReturnValue('blob:local-preview');
    vi.stubGlobal('createImageBitmap', decode);
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('keeps simulation disabled until both photo slots contain valid photos', async () => {
    const user = userEvent.setup();
    render(<PhotoIntakeForm />);
    const simulate = screen.getByRole('button', { name: /simulasikan/i });

    expect((simulate as HTMLButtonElement).disabled).toBe(true);
    await user.upload(
      screen.getByLabelText(/foto wajah/i),
      validFile('face.png'),
    );

    await waitFor(() => expect(screen.getByText('face.png')).toBeTruthy());
    expect((simulate as HTMLButtonElement).disabled).toBe(true);

    await user.upload(
      screen.getByLabelText(/foto seluruh tubuh/i),
      validFile('body.png'),
    );
    await waitFor(() =>
      expect((simulate as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it('allows removing a selected photo and disables simulation again', async () => {
    const user = userEvent.setup();
    render(<PhotoIntakeForm />);

    await user.upload(
      screen.getByLabelText(/foto wajah/i),
      validFile('face.png'),
    );
    await user.upload(
      screen.getByLabelText(/foto seluruh tubuh/i),
      validFile('body.png'),
    );
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /simulasikan/i }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );

    await user.click(screen.getByRole('button', { name: /hapus foto wajah/i }));

    expect(
      (screen.getByRole('button', { name: /simulasikan/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByText('face.png')).toBeNull();
  });

  it('replaces a photo preview and reports invalid replacements without losing the valid photo', async () => {
    const user = userEvent.setup();
    render(<PhotoIntakeForm />);
    const faceInput = screen.getByLabelText(/foto wajah/i);

    await user.upload(faceInput, validFile('first.png'));
    await waitFor(() => expect(screen.getByText('first.png')).toBeTruthy());
    await user.upload(faceInput, validFile('replacement.png'));
    await waitFor(() =>
      expect(screen.getByText('replacement.png')).toBeTruthy(),
    );

    decode.mockRejectedValueOnce(new Error('decode failed'));
    await user.upload(faceInput, validFile('broken.png'));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/tidak dapat dibaca/i),
    );
    expect(screen.getByText('replacement.png')).toBeTruthy();
    expect(screen.queryByText('broken.png')).toBeNull();
  });

  it('revokes old local preview URLs after replacement and removal', async () => {
    const user = userEvent.setup();
    createObjectURL
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second')
      .mockReturnValueOnce('blob:third');
    const view = render(<PhotoIntakeForm />);
    const faceInput = screen.getByLabelText(/foto wajah/i);

    await user.upload(faceInput, validFile('first.png'));
    await waitFor(() => expect(screen.getByText('first.png')).toBeTruthy());
    await user.upload(faceInput, validFile('second.png'));
    await waitFor(() => expect(screen.getByText('second.png')).toBeTruthy());
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first');

    await user.click(screen.getByRole('button', { name: /hapus foto wajah/i }));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second');

    await user.upload(faceInput, validFile('third.png'));
    await waitFor(() => expect(screen.getByText('third.png')).toBeTruthy());
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:third');
  });

  it('simulates locally, clearly says no file was sent, and makes no request', async () => {
    const user = userEvent.setup();
    render(<PhotoIntakeForm />);
    await user.upload(
      screen.getByLabelText(/foto wajah/i),
      validFile('face.png'),
    );
    await user.upload(
      screen.getByLabelText(/foto seluruh tubuh/i),
      validFile('body.png'),
    );
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /simulasikan/i }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );

    await user.click(screen.getByRole('button', { name: /simulasikan/i }));

    expect(screen.getByRole('status').textContent).toMatch(
      /simulasi selesai.*tidak ada foto dikirim atau disimpan/i,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('enforces the single-photo count per slot and links to the privacy policy', async () => {
    const user = userEvent.setup();
    render(<PhotoIntakeForm />);
    const faceInput = screen.getByLabelText(/foto wajah/i);

    await user.upload(faceInput, validFile('face.png'));
    await waitFor(() => expect(screen.getByText('face.png')).toBeTruthy());

    Object.defineProperty(faceInput, 'files', {
      configurable: true,
      value: [validFile('extra-1.png'), validFile('extra-2.png')],
    });
    faceInput.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/maksimal 1 foto/i),
    );
    expect(screen.getByText('face.png')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /kebijakan privasi/i }).getAttribute('href'),
    ).toBe('/privacy');
  });

  it('reports declared MIME mismatch when file content signature differs', async () => {
    const user = userEvent.setup();
    render(<PhotoIntakeForm />);
    const faceInput = screen.getByLabelText(/foto wajah/i);

    const mismatched = new File([PNG_HEADER], 'spoofed.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(faceInput, mismatched);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(
        /format isi file tidak sesuai/i,
      ),
    );
  });

  it('requires gender selection and consent before enabling Gemini analysis and sends gender in payload', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tokens: [{ secret: 'tok_dev_1' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ photo_path: 'face/path.png' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ photo_path: 'body/path.png' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'job-1', status: 'completed' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'completed',
          result: {
            personal_color: {
              primary_season: 'winter',
              sub_season: 'deep winter',
              confidence_level: 'high',
              recommended_colors: ['#000000'],
            },
            body_shape: {
              category: 'trapezoid',
              confidence_level: 'high',
              styling_guidance: ['Gunakan blazer structured'],
            },
          },
        }),
      });

    render(<PhotoIntakeForm />);

    const analyzeBtn = screen.getByRole('button', {
      name: /analisis dengan gemini ai/i,
    }) as HTMLButtonElement;
    expect(analyzeBtn.disabled).toBe(true);

    await user.upload(
      screen.getByLabelText(/foto wajah/i),
      validFile('face.png'),
    );
    await user.upload(
      screen.getByLabelText(/foto seluruh tubuh/i),
      validFile('body.png'),
    );

    const consentCheckbox = screen.getByRole('checkbox', {
      name: /saya menyetujui pemrosesan foto/i,
    });
    await user.click(consentCheckbox);

    // Still disabled because gender is not selected yet
    expect(analyzeBtn.disabled).toBe(true);

    const maleRadio = screen.getByRole('radio', { name: /pria/i });
    await user.click(maleRadio);

    await waitFor(() => expect(analyzeBtn.disabled).toBe(false));
    await user.click(analyzeBtn);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/analysis',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            photo_path: 'face/path.png',
            full_body_photo_path: 'body/path.png',
            gender: 'male',
            consent: true,
          }),
        }),
      ),
    );
  });
});
