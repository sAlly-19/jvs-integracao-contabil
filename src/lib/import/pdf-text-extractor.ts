type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

type PdfTextItem = {
  str: string;
  transform: number[];
};

type PdfDocumentInput = Parameters<PdfJsModule["getDocument"]>[0] & {
  disableWorker?: boolean;
};

let pdfJsModule: PdfJsModule | null = null;

const PDF_READ_TIMEOUT = 30000;
const MAX_PDF_PAGES = 100;
const PDF_WORKER_SRC = "/pdf.worker.min.mjs";

export async function extractPdfTextFromBuffer(buffer: ArrayBuffer, timeoutMs = PDF_READ_TIMEOUT): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout na leitura do PDF - o arquivo pode estar corrompido ou muito grande.'));
    }, timeoutMs);

    loadPdfJs()
      .then((pdfjs) => {
        if (!pdfjs) {
          clearTimeout(timeout);
          reject(new Error('Falha ao carregar processador de PDF.'));
          return;
        }

        const documentInput: PdfDocumentInput = {
          data: new Uint8Array(buffer),
          disableFontFace: true,
          disableWorker: true
        };

        const loadingTask = pdfjs.getDocument(documentInput);

        loadingTask.promise
          .then((pdf) => {
            const pages: string[] = [];
            const totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES);

            const processPage = (pageNumber: number): Promise<void> => {
              if (pageNumber > totalPages) {
                return Promise.resolve();
              }

              return pdf.getPage(pageNumber)
                .then((page) => page.getTextContent())
                .then((content) => {
                  const pageItems = content.items.flatMap((item) => (isPdfTextItem(item) ? [{ str: item.str, transform: item.transform }] : []));
                  pages.push(groupTextItemsByLine(pageItems));
                  return processPage(pageNumber + 1);
                })
                .catch((pageError) => {
                  console.warn(`Erro ao processar pagina ${pageNumber}:`, pageError);
                  return processPage(pageNumber + 1);
                });
            };

            return processPage(1)
              .then(() => {
                clearTimeout(timeout);
                const result = pages
                  .join("\n")
                  .replace(/[ \t]+/g, " ")
                  .replace(/\n{3,}/g, "\n\n")
                  .trim();

                if (result.length === 0) {
                  reject(new Error('PDF não contém texto extratível. Verifique se é um PDF com texto selecionável ou tente outro arquivo.'));
                  return;
                }

                resolve(result);
              })
              .catch((pdfError) => {
                clearTimeout(timeout);
                reject(pdfError);
              });
          })
          .catch((getDocError) => {
            clearTimeout(timeout);
            reject(new Error(`Falha ao carregar documento PDF: ${getDocError instanceof Error ? getDocError.message : 'Erro desconhecido'}`));
          });
      })
      .catch((loadError) => {
        clearTimeout(timeout);
        reject(loadError);
      });
  });
}

async function loadPdfJs(): Promise<PdfJsModule | null> {
  try {
    if (!pdfJsModule) {
      pdfJsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
    }

    if (typeof window !== "undefined" && !pdfJsModule.GlobalWorkerOptions.workerSrc) {
      pdfJsModule.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
    }

    return pdfJsModule;
  } catch (error) {
    console.error('Erro ao carregar PDFJS:', error);
    return null;
  }
}

function isPdfTextItem(item: unknown): item is PdfTextItem {
  if (!item || typeof item !== "object") {
    return false;
  }

  const candidate = item as Partial<PdfTextItem>;
  return typeof candidate.str === "string" && Array.isArray(candidate.transform);
}

function groupTextItemsByLine(items: PdfTextItem[]) {
  const rows = new Map<number, PdfTextItem[]>();

  for (const item of items) {
    const y = item.transform[5] ?? 0;
    const rowKey = Math.round(y / 3) * 3;
    rows.set(rowKey, [...(rows.get(rowKey) ?? []), item]);
  }

  return Array.from(rows.entries())
    .sort(([rowA], [rowB]) => rowB - rowA)
    .map(([, rowItems]) =>
      rowItems
        .sort((itemA, itemB) => (itemA.transform[4] ?? 0) - (itemB.transform[4] ?? 0))
        .map((item) => item.str.trim())
        .filter(Boolean)
        .join(" ")
    )
    .filter(Boolean)
    .join("\n");
}
