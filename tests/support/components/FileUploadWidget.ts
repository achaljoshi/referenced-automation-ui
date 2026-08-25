import type { Locator, Page } from '@playwright/test';
import { BaseComponent } from '../../../src/base/BaseComponent';

/**
 * A reusable "pick a file, see its name confirmed" widget. In this small
 * demo it only appears once, but the point of BaseComponent is that a real
 * app's equivalent (an attachments widget, say) usually appears on several
 * pages - every page object embedding it constructs this same class against
 * its own root Locator instead of re-implementing "upload + read back the
 * confirmation" from scratch each time.
 */
export class FileUploadWidget extends BaseComponent {
  private readonly fileInput = this.within('input[type="file"]');
  private readonly fileNameLabel = this.within('#file-name');

  constructor(page: Page, root: Locator) {
    super(page, root);
  }

  async pickFile(filePath: string): Promise<void> {
    await this.uploadFile(this.fileInput, filePath);
  }

  async uploadedFileName(): Promise<string> {
    return this.getText(this.fileNameLabel);
  }
}
