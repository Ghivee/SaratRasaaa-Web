"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Loader2, FileText, CheckCircle2, XCircle, Clock } from "lucide-react";
async function adminFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": token,
      ...(init?.headers || {}),
    },
  });
  return res;
}
import { Badge } from "@/components/ui/badge";

interface ReportRow {
  kodeReferensi: string;
  nama: string;
  kontak: string;
  jumlahOrang: number;
  checkedInAt: string | null;
  statusHadir: "Tepat Waktu" | "Telat" | "Tidak Hadir";
}

export function CheckInReport({ events, token }: { events: any[]; token: string }) {
  const [selectedEventId, setSelectedEventId] = React.useState<string>("all");
  const [report, setReport] = React.useState<ReportRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [eventData, setEventData] = React.useState<any>(null);

  const fetchReport = React.useCallback(async (idEvent: string) => {
    if (!idEvent || idEvent === "all") {
      setReport([]);
      setEventData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/check-in/report?idEvent=${idEvent}`, token);
      if (res.ok) {
        const data = await res.json();
        setReport(data.report || []);
        setEventData(data.event || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    fetchReport(selectedEventId);
  }, [selectedEventId, fetchReport]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="print-container">
      {/* Global Print CSS to isolate this container when printing */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden; }
          .print-container, .print-container * { visibility: visible; }
          .print-container { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
          .no-print { display: none !important; }
        }
      `}} />
      <Card className="mt-6 print:shadow-none print:border-none print:m-0">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5 text-pink-primary" />
            Laporan Kehadiran
          </CardTitle>
          <CardDescription>
            Lihat data kehadiran pendaftar per event.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Pilih Event..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">-- Pilih Event --</SelectItem>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.judul}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handlePrint}
            disabled={!eventData || report.length === 0}
            className="shrink-0"
          >
            <Printer className="size-4 mr-2" />
            Cetak
          </Button>
        </div>
      </CardHeader>

      {/* Print-only header */}
      <div className="hidden print:block mb-6 space-y-2">
        <h1 className="text-2xl font-bold text-center">Laporan Kehadiran Event</h1>
        {eventData && (
          <div className="text-center text-sm mb-4">
            <p className="font-semibold text-lg">{eventData.judul}</p>
            <p>{eventData.tanggal ? (() => {
              const d = new Date(eventData.tanggal);
              return isNaN(d.getTime()) ? eventData.tanggal : d.toLocaleString("id-ID", {
                dateStyle: "full",
                timeStyle: "short",
              });
            })() : "-"}</p>
            <p>{eventData.lokasi}</p>
          </div>
        )}
      </div>

      <CardContent>
        {selectedEventId === "all" ? (
          <div className="text-center py-10 text-muted-foreground text-sm print:hidden">
            Silakan pilih event untuk melihat laporan kehadiran.
          </div>
        ) : loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-8 animate-spin text-pink-primary" />
          </div>
        ) : report.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            Tidak ada data pendaftar (verified) untuk event ini.
          </div>
        ) : (
          <div className="overflow-x-auto w-full border rounded-xl print:border-none print:overflow-visible">
            <Table className="text-sm print:text-xs">
              <TableHeader className="bg-muted/50 print:bg-transparent">
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kontak</TableHead>
                  <TableHead className="text-right">Orang</TableHead>
                  <TableHead>Waktu Check-in</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((row) => (
                  <TableRow key={row.kodeReferensi} className="print:break-inside-avoid">
                    <TableCell className="font-mono text-xs">{row.kodeReferensi}</TableCell>
                    <TableCell className="font-medium">{row.nama}</TableCell>
                    <TableCell className="font-data text-muted-foreground">{row.kontak}</TableCell>
                    <TableCell className="text-right font-data">{row.jumlahOrang}</TableCell>
                    <TableCell className="font-data text-xs text-muted-foreground">
                      {row.checkedInAt
                        ? (() => {
                            const d = new Date(row.checkedInAt);
                            return isNaN(d.getTime()) ? String(row.checkedInAt) : d.toLocaleString("id-ID", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            });
                          })()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {row.statusHadir === "Tepat Waktu" && (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/30 print:border-none print:p-0">
                          <CheckCircle2 className="size-3 mr-1 print:hidden" /> Tepat Waktu
                        </Badge>
                      )}
                      {row.statusHadir === "Telat" && (
                        <Badge variant="outline" className="bg-amber/10 text-amber border-amber/30 print:border-none print:p-0">
                          <Clock className="size-3 mr-1 print:hidden" /> Telat
                        </Badge>
                      )}
                      {row.statusHadir === "Tidak Hadir" && (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 print:border-none print:p-0">
                          <XCircle className="size-3 mr-1 print:hidden" /> Tidak Hadir
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
