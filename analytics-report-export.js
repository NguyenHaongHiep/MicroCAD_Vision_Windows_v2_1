/* The browser embeds fonts and prints the same pages shown in Report Editor. */
(() => {
  'use strict';
  async function print(pages) {
    await document.fonts.ready;
    await Promise.all([...pages.querySelectorAll('img')].map(img=>img.decode()));
    const title=document.title;
    document.title=pages.querySelector('h2')?.textContent.trim() || title;
    try {
      window.print();
    } finally {
      document.title=title;
    }
  }
  globalThis.MicroCADReportExporter={print};
})();
