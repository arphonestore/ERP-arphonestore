"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export type LaporanExportRow = {
  tanggal: string;
  type: string;
  imei: string;
  pembeli: string;
  modal: number;
  jual: number;
  profit: number;
};

export type LaporanExportSnapshot = {
  fileName: string;
  periodeLabel: string;
  totalItem: number;
  totalModal: number;
  totalJual: number;
  totalProfit: number;
  rows: LaporanExportRow[];
  loadedAt: Date;
};

type LaporanExportProps = Omit<LaporanExportSnapshot, "loadedAt"> & {
  loadedAt: Date | null;
  disabled?: boolean;
  maxSnapshotAgeMs?: number;
  onPrepareExport?: () => Promise<LaporanExportSnapshot | null>;
};

const JAKARTA_TIME_ZONE = "Asia/Jakarta";

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;

  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatTanggal(value: string) {
  const parsed = parseDateOnly(value);
  if (!parsed) return value;

  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(parsed);
}

function formatJakartaTimestamp(value: Date) {
  return `${new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA_TIME_ZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value)} WIB`;
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
  loadedAt,
  disabled = false,
  maxSnapshotAgeMs = 5 * 60_000,
  onPrepareExport,
}: LaporanExportProps) {
  const [exporting, setExporting] = useState(false);

  const handleExportPdf = async () => {
    if (disabled || exporting) {
      return;
    }

    setExporting(true);

    try {
      const fallbackSnapshot: LaporanExportSnapshot | null = loadedAt
        ? { fileName, periodeLabel, totalItem, totalModal, totalJual, totalProfit, rows, loadedAt }
        : null;
      const snapshot = onPrepareExport ? await onPrepareExport() : fallbackSnapshot;

      if (!snapshot) {
        toast.error("Data terbaru tidak dapat dimuat. Export dibatalkan agar PDF tidak memakai snapshot usang.");
        return;
      }

      if (Date.now() - snapshot.loadedAt.getTime() > maxSnapshotAgeMs) {
        toast.error("Snapshot laporan sudah terlalu lama. Muat ulang data sebelum export.");
        return;
      }

      const { default: jsPDF } = await import("jspdf");
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
          return false;
        }

        pdf.addPage();
        y = margin;
        return true;
      };

      const drawText = (text: string, x: number, nextY = 6) => {
        pdf.text(text, x, y);
        y += nextY;
      };

      let logoDrawn = false;

      try {
        const logoDataUrl = await loadLogoAsPngDataUrl("/assets/logo-fix.svg");
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
      drawText(`Periode: ${snapshot.periodeLabel}`, textStartX, 5);
      drawText(`Snapshot data: ${formatJakartaTimestamp(snapshot.loadedAt)}`, textStartX, 5);
      drawText(`Dicetak: ${formatJakartaTimestamp(new Date())}`, textStartX, 7);

      y = Math.max(y, margin + logoSize + 6);

      ensureSpace(30);
      pdf.setDrawColor(220, 220, 220);
      pdf.rect(margin, y, usableWidth, 28);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text(`Total Item: ${snapshot.totalItem}`, margin + 3, y + 6);
      pdf.text(`Total Modal: ${formatRupiah(snapshot.totalModal)}`, margin + 3, y + 12);
      pdf.text(`Total Harga Jual: ${formatRupiah(snapshot.totalJual)}`, margin + 3, y + 18);
      pdf.text(`Laba Kotor: ${formatRupiah(snapshot.totalProfit)}`, margin + 3, y + 24);

      y += 34;
      ensureSpace(10);

      const columns = [
        { title: "Tanggal", width: 22 },
        { title: "Type", width: 34 },
        { title: "IMEI", width: 30 },
        { title: "Pembeli", width: 30 },
        { title: "Modal", width: 24 },
        { title: "Jual", width: 24 },
        { title: "Laba", width: 26 },
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

      const wrapCell = (value: string, width: number) => {
        const lines = pdf.splitTextToSize(value, width - 3) as string[];
        const maxLines = 10;

        if (lines.length <= maxLines) return lines;

        const visible = lines.slice(0, maxLines);
        visible[maxLines - 1] = `${visible[maxLines - 1].slice(0, -1)}…`;
        return visible;
      };

      drawTableHeader();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);

      for (const row of snapshot.rows) {
        const values = [
          formatTanggal(row.tanggal),
          row.type,
          row.imei,
          row.pembeli,
          formatRupiah(row.modal),
          formatRupiah(row.jual),
          formatRupiah(row.profit),
        ];
        const wrappedValues = values.map((value, columnIndex) => wrapCell(value, columns[columnIndex].width));
        const rowHeight = Math.max(...wrappedValues.map((lines) => lines.length)) * 4 + 3;
        const pageAdded = ensureSpace(rowHeight + 1);

        if (pageAdded) {
          drawTableHeader();
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8.5);
        }

        let x = margin;

        wrappedValues.forEach((wrapped, columnIndex) => {
          const column = columns[columnIndex];
          pdf.rect(x, y, column.width, rowHeight);
          pdf.text(wrapped, x + 1.5, y + 4);
          x += column.width;
        });

        y += rowHeight;
      }

      if (snapshot.rows.length === 0) {
        ensureSpace(10);
        pdf.setFont("helvetica", "italic");
        pdf.text("Tidak ada data transaksi pada periode ini.", margin, y + 6);
      }

      const pageCount = pdf.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(110);
        pdf.text(`Halaman ${page} dari ${pageCount}`, pageWidth - margin, pageHeight - 5, { align: "right" });
      }

      pdf.save(`${snapshot.fileName}.pdf`);
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : "Gagal export PDF.";
      toast.error(`${message} Coba lagi.`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button type="button" variant="default" onClick={() => void handleExportPdf()} disabled={disabled || exporting}>
      {exporting ? "Memuat data & mengekspor..." : "Export PDF"}
    </Button>
  );
}
