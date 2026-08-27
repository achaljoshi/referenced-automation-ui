import type { Locator, Page } from '@playwright/test';
import { actions, locators } from '../../../src';

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
  // byLabel, not a role locator: file inputs' ARIA role varies across
  // browsers, but the <label for="file-input"> association is reliable
  // regardless - and locators.byLabel/byRole/etc. all scope into a plain
  // Locator (root) exactly like they scope into a Page.
  const fileInput = locators.byLabel(root, 'Upload a file');
  const fileNameLabel = root.locator('#file-name'); // plain <p>, no accessible name of its own
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
