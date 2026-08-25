import type { Locator, Page } from '@playwright/test';
import { actions } from '../../../src';

/**
 * A reusable "pick a file, see its name confirmed" widget. In this small
 * demo it only appears once, but the point of a component factory is that a
 * real app's equivalent (an attachments widget, say) usually appears on
 * several pages - every page object embedding it calls this same function
 * against its own root Locator instead of re-implementing "upload + read
 * back the confirmation" from scratch each time.
 */
export interface FileUploadWidget {
  pickFile(filePath: string): Promise<void>;
  uploadedFileName(): Promise<string>;
}

export function createFileUploadWidget(page: Page, root: Locator): FileUploadWidget {
  const fileInput = root.locator('input[type="file"]');
  const fileNameLabel = root.locator('#file-name');
  void page; // kept in the signature for parity with other component factories that do need the Page directly

  return {
    async pickFile(filePath) {
      await actions.uploadFile(fileInput, filePath);
    },

    async uploadedFileName() {
      return actions.getText(fileNameLabel);
    },
  };
}
