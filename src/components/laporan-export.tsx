"use client";

import jsPDF from "jspdf";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type LaporanExportProps = {
  fileName: string;
  periodeLabel: string;
  totalItem: number;
  totalModal: number;
  totalJual: number;
  totalProfit: number;
  rows: Array<{
    tanggal: string;
    type: string;
    imei: string;
    pembeli: string;
    modal: number;
    jual: number;
    profit: number;
  }>;
  disabled?: boolean;
};

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTanggal(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value));
}

async function loadLogoAsPngDataUrl(src: string) {
  const response = await fetch(src, { cache: "force-cache" });

  if (!response.ok) {
    throw new Error("Logo request failed");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Logo image decode failed"));
      img.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas context unavailable");
    }

    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function LaporanExport({
  fileName,
  periodeLabel,
  totalItem,
  totalModal,
  totalJual,
  totalProfit,
  rows,
  disabled = false,
}: LaporanExportProps) {
  const [exporting, setExporting] = useState(false);

  const handleExportPdf = async () => {
    if (disabled || exporting) {
      return;
    }

    setExporting(true);

    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const usableWidth = pageWidth - margin * 2;
      const logoSize = 18;

      let y = margin;

      const ensureSpace = (requiredHeight: number) => {
        if (y + requiredHeight <= pageHeight - margin) {
          return;
        }

        pdf.addPage();
        y = margin;
      };

      const drawText = (text: string, x: number, nextY = 6) => {
        pdf.text(text, x, y);
        y += nextY;
      };

      let logoDrawn = false;

      try {
        const logoDataUrl = await loadLogoAsPngDataUrl("/assets/ar-logo.webp");
        pdf.addImage(logoDataUrl, "PNG", margin, y, logoSize, logoSize);
        logoDrawn = true;
      } catch {
        logoDrawn = false;
      }

      const textStartX = logoDrawn ? margin + logoSize + 4 : margin;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      drawText("AR Store", textStartX, 7);

      pdf.setFontSize(12);
      drawText("Laporan Transaksi Barang Keluar", textStartX, 7);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      drawText(`Periode: ${periodeLabel}`, textStartX, 5);
      drawText(
        `Dicetak: ${new Intl.DateTimeFormat("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date())}`,
        textStartX,
        7
      );

      y = Math.max(y, margin + logoSize + 4);

      ensureSpace(30);
      pdf.setDrawColor(220, 220, 220);
      pdf.rect(margin, y, usableWidth, 28);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text(`Total Item: ${totalItem}`, margin + 3, y + 6);
      pdf.text(`Total Modal: ${formatRupiah(totalModal)}`, margin + 3, y + 12);
      pdf.text(`Total Harga Jual: ${formatRupiah(totalJual)}`, margin + 3, y + 18);
      pdf.text(`Profit: ${formatRupiah(totalProfit)}`, margin + 3, y + 24);

      y += 34;
      ensureSpace(10);

      const columns = [
        { title: "Tanggal", width: 22 },
        { title: "Type", width: 34 },
        { title: "IMEI", width: 30 },
        { title: "Pembeli", width: 30 },
        { title: "Modal", width: 24 },
        { title: "Jual", width: 24 },
        { title: "Profit", width: 26 },
      ];

      const drawTableHeader = () => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        let x = margin;

        for (const column of columns) {
          pdf.rect(x, y, column.width, 8);
          pdf.text(column.title, x + 2, y + 5.5);
          x += column.width;
        }

        y += 8;
      };

      drawTableHeader();

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);

      rows.forEach((row) => {
        const values = [
          formatTanggal(row.tanggal),
          row.type,
          row.imei,
          row.pembeli,
          formatRupiah(row.modal),
          formatRupiah(row.jual),
          formatRupiah(row.profit),
        ];

        const lineCounts = values.map((value, columnIndex) => {
          const maxTextWidth = columns[columnIndex].width - 3;
          return pdf.splitTextToSize(value, maxTextWidth).length;
        });

        const rowHeight = Math.max(...lineCounts) * 4 + 3;
        ensureSpace(rowHeight + 1);

        if (y === margin) {
          drawTableHeader();
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8.5);
        }

        let x = margin;

        values.forEach((value, columnIndex) => {
          const column = columns[columnIndex];
          const wrapped = pdf.splitTextToSize(value, column.width - 3);

          pdf.rect(x, y, column.width, rowHeight);
          pdf.text(wrapped, x + 1.5, y + 4);
          x += column.width;
        });

        y += rowHeight;
      });

      if (rows.length === 0) {
        ensureSpace(10);
        pdf.setFont("helvetica", "italic");
        pdf.text("Tidak ada data transaksi pada periode ini.", margin, y + 6);
      }

      pdf.save(`${fileName}.pdf`);
    } catch {
      toast.error("Gagal export PDF. Coba lagi atau ubah mode export.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button variant="default" onClick={handleExportPdf} disabled={disabled || exporting}>
      {exporting ? "Mengekspor..." : "Export PDF"}
    </Button>
  );
}
