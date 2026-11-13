// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageCropperModal } from '../../src/app/admin/image-cropper-modal';

describe('ImageCropperModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders cropper modal dialog with title, zoom slider, and action buttons', () => {
    const file = new File(['dummy-content'], 'test-garment.jpg', {
      type: 'image/jpeg',
    });
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ImageCropperModal
        file={file}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Sesuaikan Foto Produk \(3:4\)/i)).toBeTruthy();
    expect(
      screen.getByText(/Geser foto dan atur zoom/i),
    ).toBeTruthy();

    const zoomSlider = screen.getByLabelText(/Zoom/i) as HTMLInputElement;
    expect(zoomSlider).toBeTruthy();
    expect(zoomSlider.value).toBe('1');

    fireEvent.change(zoomSlider, { target: { value: '1.5' } });
    expect(zoomSlider.value).toBe('1.5');
    expect(screen.getByText('1.5x')).toBeTruthy();
  });

  it('triggers onCancel when clicking Batal or pressing Escape key', () => {
    const file = new File(['dummy-content'], 'test-garment.jpg', {
      type: 'image/jpeg',
    });
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ImageCropperModal
        file={file}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    // Cancel via Batal button
    fireEvent.click(screen.getByRole('button', { name: /Batal/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Cancel via Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('calls onConfirm with file when clicking Potong & Gunakan Foto', () => {
    const file = new File(['dummy-content'], 'test-garment.jpg', {
      type: 'image/jpeg',
    });
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ImageCropperModal
        file={file}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Potong & Gunakan Foto/i }),
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(file);
  });

  it('supports cropping existing images via imageUrl', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ImageCropperModal
        imageUrl="https://example.com/existing-product.jpg"
        fileName="existing-product.jpg"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    const img = screen.getByAltText('Crop target') as HTMLImageElement;
    expect(img.src).toBe('https://example.com/existing-product.jpg');
    expect(img.getAttribute('crossorigin')).toBe('anonymous');

    fireEvent.click(
      screen.getByRole('button', { name: /Potong & Gunakan Foto/i }),
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'existing-product-cropped.jpg',
      }),
    );
  });
});
