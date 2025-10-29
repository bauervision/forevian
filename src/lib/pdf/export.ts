// /lib/pdf/export.ts
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Export a DOM node as a PDF (single or multi-page).
 * - target: HTMLElement to capture
 * - filename: "Expenses-Report.pdf"
 * - margin: PDF margin in px (relative to the rendered canvas)
 * - scale: canvas scale for sharper text (2–3 is crisp, higher = larger memory)
 */
export async function exportToPdf(
  target: HTMLElement,
  {
    filename = "Expenses-Report.pdf",
    margin = 24,
    scale = 2,
  }: { filename?: string; margin?: number; scale?: number } = {}
) {
  const canvas = await html2canvas(target, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: target.scrollWidth,
    windowHeight: target.scrollHeight,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Fit image to page width with margins; paginate vertically if needed
  const usableWidth = pageWidth - margin * 2;
  const ratio = usableWidth / canvas.width;
  const renderWidth = usableWidth;
  const renderHeight = canvas.height * ratio;

  let y = margin;
  let remaining = renderHeight;
  const pageImgHeight = pageHeight - margin * 2;

  // Draw first page
  pdf.addImage(
    imgData,
    "PNG",
    margin,
    y,
    renderWidth,
    renderHeight,
    "",
    "FAST"
  );

  // If content longer than one page, add slices
  while (remaining > pageImgHeight) {
    pdf.addPage();
    y = margin - (renderHeight - remaining);
    pdf.addImage(
      imgData,
      "PNG",
      margin,
      y,
      renderWidth,
      renderHeight,
      "",
      "FAST"
    );
    remaining -= pageImgHeight;
  }

  pdf.save(filename);
}
