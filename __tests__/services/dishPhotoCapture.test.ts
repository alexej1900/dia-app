import {
  captureAndRecognizeDishPhoto,
  PhotoPermissionDeniedError,
  PhotoPickCancelledError,
} from '../../src/services/dishPhotoCapture';

jest.mock('expo-image-picker', () => {
  const actualExports: any = {};
  actualExports.requestCameraPermissionsAsync = jest.fn();
  actualExports.requestMediaLibraryPermissionsAsync = jest.fn();
  actualExports.launchCameraAsync = jest.fn();
  actualExports.launchImageLibraryAsync = jest.fn();
  return actualExports;
});

jest.mock('expo-image-manipulator', () => {
  const manipulate = jest.fn();
  return {
    ImageManipulator: { manipulate },
    SaveFormat: { JPEG: 'jpeg' },
  };
});

jest.mock('../../src/db/database', () => ({
  openDatabase: jest.fn(),
}));

jest.mock('../../src/repositories/productsRepo', () => ({
  listProducts: jest.fn(),
}));

jest.mock('../../src/services/dishRecognition', () => {
  class DishRecognitionError extends Error {}
  return {
    recognizeDish: jest.fn(),
    DishRecognitionError,
  };
});

import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { openDatabase } from '../../src/db/database';
import { listProducts } from '../../src/repositories/productsRepo';
import { recognizeDish, DishRecognitionError } from '../../src/services/dishRecognition';

describe('captureAndRecognizeDishPhoto', () => {
  let saveAsyncMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    saveAsyncMock = jest.fn().mockResolvedValue({ base64: 'abc123' });
    const renderAsync = jest.fn().mockResolvedValue({ saveAsync: saveAsyncMock });
    const resize = jest.fn().mockReturnValue({ renderAsync });
    (ImageManipulator.manipulate as jest.Mock).mockReturnValue({ resize });

    (openDatabase as jest.Mock).mockResolvedValue({});
    (listProducts as jest.Mock).mockResolvedValue([{ name: 'Rice' }, { name: 'Beans' }]);
    (recognizeDish as jest.Mock).mockResolvedValue([{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 100 }]);
  });

  it('requests camera permission and picks via the camera for source "camera"', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 800, height: 600 }],
    });

    const items = await captureAndRecognizeDishPhoto('camera');

    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(items).toEqual([{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 100 }]);
  });

  it('requests media library permission and picks via the gallery for source "gallery"', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 600, height: 800 }],
    });

    await captureAndRecognizeDishPhoto('gallery');

    expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('resizes by width when the image is wider than tall', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 1600, height: 900 }],
    });

    await captureAndRecognizeDishPhoto('camera');

    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file://photo.jpg');
    const resizeMock = (ImageManipulator.manipulate as jest.Mock).mock.results[0].value.resize;
    expect(resizeMock).toHaveBeenCalledWith({ width: 1024 });
  });

  it('resizes by height when the image is taller than wide', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 900, height: 1600 }],
    });

    await captureAndRecognizeDishPhoto('camera');

    const resizeMock = (ImageManipulator.manipulate as jest.Mock).mock.results[0].value.resize;
    expect(resizeMock).toHaveBeenCalledWith({ height: 1024 });
  });

  it('throws PhotoPermissionDeniedError when permission is denied', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });

    await expect(captureAndRecognizeDishPhoto('camera')).rejects.toThrow(PhotoPermissionDeniedError);
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('throws PhotoPickCancelledError when the picker is cancelled', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: [] });

    await expect(captureAndRecognizeDishPhoto('camera')).rejects.toThrow(PhotoPickCancelledError);
  });

  it('throws PhotoPickCancelledError when no assets are returned', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [] });

    await expect(captureAndRecognizeDishPhoto('camera')).rejects.toThrow(PhotoPickCancelledError);
  });

  it('throws DishRecognitionError when the manipulator produces no base64 data', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 800, height: 600 }],
    });
    const saveAsync = jest.fn().mockResolvedValue({ base64: undefined });
    const renderAsync = jest.fn().mockResolvedValue({ saveAsync });
    const resize = jest.fn().mockReturnValue({ renderAsync });
    (ImageManipulator.manipulate as jest.Mock).mockReturnValue({ resize });

    await expect(captureAndRecognizeDishPhoto('camera')).rejects.toThrow(DishRecognitionError);
  });

  it('passes the resized base64 image and product names to recognizeDish', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 800, height: 600 }],
    });

    await captureAndRecognizeDishPhoto('camera');

    expect(recognizeDish).toHaveBeenCalledWith('abc123', ['Rice', 'Beans']);
    expect(saveAsyncMock).toHaveBeenCalledWith({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  });
});
