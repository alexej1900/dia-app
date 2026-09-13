import { File, Directory, Paths } from 'expo-file-system';
import { generateId } from '../utils/id';

const PHOTOS_DIR_NAME = 'dish-photos';

export async function persistDishPhoto(sourceUri: string): Promise<string> {
  const photosDir = new Directory(Paths.document, PHOTOS_DIR_NAME);
  if (!photosDir.exists) {
    photosDir.create();
  }

  const sourceFile = new File(sourceUri);
  const destFile = new File(photosDir, `${generateId()}.jpg`);
  await sourceFile.copy(destFile);
  return destFile.uri;
}

export async function deleteDishPhoto(uri: string | null | undefined): Promise<void> {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    // Best-effort cleanup: a missing file or permission issue here must
    // never block saving or deleting a dish.
  }
}
