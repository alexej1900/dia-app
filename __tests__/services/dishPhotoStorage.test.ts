jest.mock('expo-file-system', () => ({
  File: jest.fn(),
  Directory: jest.fn(),
  Paths: { document: { __brand: 'document-dir' } },
}));

jest.mock('../../src/utils/id', () => ({
  generateId: jest.fn(),
}));

import { File, Directory, Paths } from 'expo-file-system';
import { generateId } from '../../src/utils/id';
import { persistDishPhoto, deleteDishPhoto } from '../../src/services/dishPhotoStorage';

describe('persistDishPhoto', () => {
  let copyMock: jest.Mock;
  let directoryCreateMock: jest.Mock;
  let directoryInstance: { exists: boolean; create: jest.Mock };
  let destFileInstance: { uri: string };

  beforeEach(() => {
    jest.clearAllMocks();
    (generateId as jest.Mock).mockReturnValue('generated-id');

    directoryCreateMock = jest.fn();
    directoryInstance = { exists: false, create: directoryCreateMock };
    (Directory as unknown as jest.Mock).mockImplementation(function () {
      return directoryInstance;
    });

    copyMock = jest.fn().mockResolvedValue(undefined);
    destFileInstance = { uri: 'file:///document/dish-photos/generated-id.jpg' };
    (File as unknown as jest.Mock).mockImplementation(function (...args: unknown[]) {
      // One arg => the source file (new File(sourceUri)); two args => the
      // destination file (new File(directory, name)).
      if (args.length === 1) {
        return { copy: copyMock };
      }
      return destFileInstance;
    });
  });

  it('creates the dish-photos directory when it does not exist yet', async () => {
    await persistDishPhoto('file:///cache/photo.jpg');

    expect(Directory).toHaveBeenCalledWith(Paths.document, 'dish-photos');
    expect(directoryCreateMock).toHaveBeenCalled();
  });

  it('skips directory creation when it already exists', async () => {
    directoryInstance.exists = true;

    await persistDishPhoto('file:///cache/photo.jpg');

    expect(directoryCreateMock).not.toHaveBeenCalled();
  });

  it('copies the source file to a generated filename inside the directory', async () => {
    await persistDishPhoto('file:///cache/photo.jpg');

    expect(File).toHaveBeenCalledWith('file:///cache/photo.jpg');
    expect(File).toHaveBeenCalledWith(directoryInstance, 'generated-id.jpg');
    expect(copyMock).toHaveBeenCalledWith(destFileInstance);
  });

  it('returns the persisted file uri', async () => {
    const uri = await persistDishPhoto('file:///cache/photo.jpg');

    expect(uri).toBe('file:///document/dish-photos/generated-id.jpg');
  });
});

describe('deleteDishPhoto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes the file at the given uri', async () => {
    const deleteMock = jest.fn();
    (File as unknown as jest.Mock).mockImplementation(function () {
      return { delete: deleteMock };
    });

    await deleteDishPhoto('file:///document/dish-photos/old.jpg');

    expect(File).toHaveBeenCalledWith('file:///document/dish-photos/old.jpg');
    expect(deleteMock).toHaveBeenCalled();
  });

  it('swallows an error thrown by delete()', async () => {
    (File as unknown as jest.Mock).mockImplementation(function () {
      return {
        delete: () => {
          throw new Error('file not found');
        },
      };
    });

    await expect(deleteDishPhoto('file:///document/dish-photos/missing.jpg')).resolves.not.toThrow();
  });

  it('is a no-op for null', async () => {
    await deleteDishPhoto(null);
    expect(File).not.toHaveBeenCalled();
  });

  it('is a no-op for undefined', async () => {
    await deleteDishPhoto(undefined);
    expect(File).not.toHaveBeenCalled();
  });
});
