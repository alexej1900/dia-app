import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { openDatabase } from '../db/database';
import { listProducts } from '../repositories/productsRepo';
import { recognizeDish, RecognitionResult, DishRecognitionError } from './dishRecognition';

export class PhotoPermissionDeniedError extends Error {}
export class PhotoPickCancelledError extends Error {}

export async function captureAndRecognizeDishPhoto(
  source: 'camera' | 'gallery'
): Promise<{ recognition: RecognitionResult; photoUri: string }> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new PhotoPermissionDeniedError('Camera/photo access is needed for this feature.');
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || result.assets.length === 0) {
    throw new PhotoPickCancelledError('No photo was selected.');
  }
  const asset = result.assets[0];

  // Cap the longest edge at ~1024px, scaling the other dimension proportionally,
  // regardless of orientation.
  //
  // This must be a ternary that yields exactly one key (`{ width }` OR `{ height }`),
  // not an object literal passing both with one set to `null`: expo-image-manipulator's
  // web implementation checks `!== undefined` to decide whether a dimension was
  // requested, so an explicit `null` is treated as a real (zero) value instead of
  // "auto" and crashes canvas rendering.
  const resizeOptions = asset.width >= asset.height ? { width: 1024 } : { height: 1024 };
  const rendered = await ImageManipulator.manipulate(asset.uri).resize(resizeOptions).renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) {
    throw new DishRecognitionError('Could not process the photo.');
  }

  const db = await openDatabase();
  const productNames = (await listProducts(db, '')).map((p) => p.name);
  const recognition = await recognizeDish(saved.base64, productNames);
  return { recognition, photoUri: saved.uri };
}
