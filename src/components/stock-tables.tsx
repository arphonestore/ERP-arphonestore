import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRupiah, formatTanggal } from "@/lib/format";
import type { StockInRecord, StockItem, StockOutRecord } from "@/lib/types";

export function StockTable({ data }: { data: StockItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>IMEI</TableHead>
          <TableHead>Harga</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.type}</TableCell>
            <TableCell>{item.imei}</TableCell>
            <TableCell>{formatRupiah(item.harga)}</TableCell>
            <TableCell>
              <Badge variant={item.status === "ready" ? "success" : "secondary"}>
                {item.status === "ready" ? "Ready" : "Terjual"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function StockInTable({ data }: { data: StockInRecord[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>IMEI</TableHead>
          <TableHead>Penjual</TableHead>
          <TableHead>Tanggal Masuk</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.type}</TableCell>
            <TableCell>{item.imei}</TableCell>
            <TableCell>{item.penjual}</TableCell>
            <TableCell>{formatTanggal(item.tanggal_masuk)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function StockOutTable({ data }: { data: StockOutRecord[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>IMEI</TableHead>
          <TableHead>Pembeli</TableHead>
          <TableHead>Harga Modal</TableHead>
          <TableHead>Harga Jual</TableHead>
          <TableHead>Keuntungan</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item) => {
          const keuntungan = item.harga_jual - item.harga_modal;

          return (
            <TableRow key={item.id}>
              <TableCell>{item.type}</TableCell>
              <TableCell>{item.imei}</TableCell>
              <TableCell>{item.pembeli}</TableCell>
              <TableCell>{formatRupiah(item.harga_modal)}</TableCell>
              <TableCell>{formatRupiah(item.harga_jual)}</TableCell>
              <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatRupiah(keuntungan)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
