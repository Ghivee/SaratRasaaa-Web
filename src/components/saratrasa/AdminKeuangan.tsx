"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plus, Wallet, ArrowDownRight, ArrowUpRight, FileText, Printer, Download, Pencil, Trash, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatIDR } from "@/lib/saratrasa";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AdminEventItem } from "./types";

interface AdminKeuanganProps {
  token: string;
  events?: AdminEventItem[];
}

interface KeuanganItem {
  id: string;
  tipe: "IN" | "OUT";
  nominal: number;
  kategori: string;
  keterangan: string;
  tanggal: string;
  createdAt: string;
  event?: { judul: string } | null;
}

interface Stats {
  balance: number;
  income: number;
  expense: number;
  history: KeuanganItem[];
}

export function AdminKeuangan({ token, events = [] }: AdminKeuanganProps) {
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showAdd, setShowAdd] = React.useState(false);
  const [form, setForm] = React.useState({ tipe: "OUT", nominal: "", kategori: "Operasional", keterangan: "", idEvent: "none", tanggal: new Date().toISOString().slice(0, 10) });
  const [submitting, setSubmitting] = React.useState(false);
  const [filterEvent, setFilterEvent] = React.useState<string>("all");
  const [page, setPage] = React.useState(1);
  const KEUANGAN_PER_PAGE = 20;
  const [editItem, setEditItem] = React.useState<KeuanganItem | null>(null);
  const [deleteItem, setDeleteItem] = React.useState<KeuanganItem | null>(null);

  const fetchStats = React.useCallback(async () => {
    try {
      const url = filterEvent === "all" ? "/api/admin/keuangan" : `/api/admin/keuangan?idEvent=${filterEvent}`;
      const res = await fetch(url, { headers: { "X-Admin-Token": token } });
      const data = await res.json();
      if (res.ok) setStats(data);
    } catch {
      toast.error("Gagal memuat keuangan");
    } finally {
      setLoading(false);
    }
  }, [token, filterEvent]);

  React.useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  React.useEffect(() => {
    setPage(1);
  }, [filterEvent]);

  const paginatedHistory = React.useMemo(() => {
    if (!stats?.history) return [];
    const start = (page - 1) * KEUANGAN_PER_PAGE;
    return stats.history.slice(start, start + KEUANGAN_PER_PAGE);
  }, [stats?.history, page]);
  const totalPages = stats?.history ? Math.ceil(stats.history.length / KEUANGAN_PER_PAGE) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/keuangan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Token": token },
        body: JSON.stringify({
          ...form,
          idEvent: form.idEvent === "none" ? null : form.idEvent
        })
      });
      if (res.ok) {
        toast.success("Catatan keuangan ditambahkan");
        setShowAdd(false);
        setForm({ tipe: "OUT", nominal: "", kategori: "Operasional", keterangan: "", idEvent: "none", tanggal: new Date().toISOString().slice(0, 10) });
        fetchStats();
      } else {
        toast.error("Gagal menyimpan");
      }
    } catch {
      toast.error("Error jaringan");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/keuangan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Admin-Token": token },
        body: JSON.stringify(editItem)
      });
      if (res.ok) {
        toast.success("Catatan keuangan diperbarui");
        setEditItem(null);
        fetchStats();
      } else {
        toast.error("Gagal memperbarui");
      }
    } catch {
      toast.error("Error jaringan");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItem) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/keuangan?id=${deleteItem.id}`, {
        method: "DELETE",
        headers: { "X-Admin-Token": token },
      });
      if (res.ok) {
        toast.success("Catatan keuangan dihapus");
        setDeleteItem(null);
        fetchStats();
      } else {
        toast.error("Gagal menghapus");
      }
    } catch {
      toast.error("Error jaringan");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (!stats?.history.length) {
      toast.error("Tidak ada data untuk diekspor");
      return;
    }
    
    // CSV Header
    const headers = ["Tanggal", "Tipe", "Kategori", "Keterangan", "Nominal", "Event"];
    
    // CSV Rows
    const rows = stats.history.map(item => [
      item.tanggal ? new Date(item.tanggal).toLocaleDateString("id-ID") : "-",
      item.tipe === "IN" ? "Pemasukan" : "Pengeluaran",
      item.kategori,
      `"${item.keterangan.replace(/"/g, '""')}"`, // escape quotes for CSV
      item.nominal.toString(),
      item.event ? `"${item.event.judul.replace(/"/g, '""')}"` : "-"
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `laporan_keuangan_${filterEvent || "semua"}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 print-container">
      {/* Global Print CSS to hide non-printable elements */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden; }
          .print-container, .print-container * { visibility: visible; }
          .print-container { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
          .no-print { display: none !important; }
        }
      `}} />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl text-ink">Laporan Keuangan</h2>
          <p className="text-sm text-muted-foreground">Catatan Pemasukan & Pengeluaran Kas.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 no-print">
          <Select value={filterEvent} onValueChange={setFilterEvent}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Pilih Event" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Event</SelectItem>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.judul}</SelectItem>
              ))}
            </SelectContent>
          </Select>
  
          <Button variant="outline" onClick={handleExportCSV} className="gap-2">
            <Download className="size-4" /> Export CSV
          </Button>
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <Printer className="size-4" /> Cetak Recap
          </Button>
          <Button onClick={() => setShowAdd(true)} className="bg-pink-primary hover:bg-pink-primary/90">
            <Plus className="size-4" /> Catat Kas Manual
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-pink-soft/30 rounded-lg"><Wallet className="size-5 text-pink-primary" /></div>
              <p className="text-sm font-medium text-muted-foreground">Saldo Saat Ini</p>
            </div>
            <h3 className="text-2xl font-display font-semibold text-ink">
              {loading ? <Loader2 className="size-5 animate-spin" /> : formatIDR(stats?.balance || 0)}
            </h3>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-success/10 rounded-lg"><ArrowDownRight className="size-5 text-success" /></div>
              <p className="text-sm font-medium text-muted-foreground">Total Pemasukan</p>
            </div>
            <h3 className="text-2xl font-display font-semibold text-success">
              {loading ? <Loader2 className="size-5 animate-spin" /> : formatIDR(stats?.income || 0)}
            </h3>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-rejected/10 rounded-lg"><ArrowUpRight className="size-5 text-rejected" /></div>
              <p className="text-sm font-medium text-muted-foreground">Total Pengeluaran</p>
            </div>
            <h3 className="text-2xl font-display font-semibold text-rejected">
              {loading ? <Loader2 className="size-5 animate-spin" /> : formatIDR(stats?.expense || 0)}
            </h3>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Riwayat Transaksi</CardTitle>
          <CardDescription>Semua pemasukan otomatis dari tiket dan pengeluaran manual.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : stats?.history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <FileText className="size-10 mb-3 opacity-20" />
              <p>Belum ada transaksi</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead className="text-right">Nominal</TableHead>
                    <TableHead className="text-right no-print">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedHistory.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(item.tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell>
                        {item.tipe === "IN" ? (
                          <Badge className="bg-success/15 text-success hover:bg-success/15 border-transparent">Masuk</Badge>
                        ) : (
                          <Badge className="bg-rejected/15 text-rejected hover:bg-rejected/15 border-transparent">Keluar</Badge>
                        )}
                      </TableCell>
                        <TableCell>{item.kategori}</TableCell>
                        <TableCell className="max-w-[300px] break-words whitespace-normal leading-relaxed" title={item.keterangan}>
                          {item.keterangan} {item.event && <span className="text-xs text-muted-foreground ml-1">({item.event.judul})</span>}
                        </TableCell>
                        <TableCell className={cn("text-right font-medium whitespace-nowrap", item.tipe === "IN" ? "text-success" : "text-rejected")}>
                          {item.tipe === "IN" ? "+" : "-"}{formatIDR(item.nominal)}
                        </TableCell>
                      <TableCell className="text-right no-print">
                        {!item.id.startsWith("SRT-") && (
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => setEditItem(item)}>
                              <Pencil className="size-4 text-muted-foreground hover:text-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteItem(item)}>
                              <Trash className="size-4 text-destructive/70 hover:text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          
          {!loading && stats?.history && stats.history.length > 0 && (
            <div className="text-xs text-muted-foreground mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span>
                Menampilkan {paginatedHistory.length} dari total {stats.history.length} transaksi
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="px-2 font-medium">Halaman {page} dari {totalPages}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Catat Keuangan Manual</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipe Transaksi</Label>
                <Select value={form.tipe} onValueChange={(v) => setForm({...form, tipe: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">Pemasukan</SelectItem>
                    <SelectItem value="OUT">Pengeluaran</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nominal (Rp)</Label>
                <Input type="number" required value={form.nominal} onChange={e => setForm({...form, nominal: e.target.value})} placeholder="Misal: 150000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Terkait Event (Opsional)</Label>
              <Select value={form.idEvent} onValueChange={(v) => setForm({...form, idEvent: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih event..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- Kas Umum (Tidak Terikat Event) --</SelectItem>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.judul}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Kategori</Label>
              <Input required value={form.kategori} onChange={e => setForm({...form, kategori: e.target.value})} placeholder={form.tipe === "IN" ? "Misal: Donasi, Sponsorship" : "Misal: Konsumsi, Logistik"} />
            </div>
            <div className="space-y-2">
              <Label>Keterangan</Label>
              <Textarea required value={form.keterangan} onChange={e => setForm({...form, keterangan: e.target.value})} placeholder="Detail transaksi..." />
            </div>
            <div className="space-y-2">
              <Label>Tanggal</Label>
              <Input type="date" required value={form.tanggal} onChange={e => setForm({...form, tanggal: e.target.value})} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting} className="bg-pink-primary hover:bg-pink-primary/90">
                {submitting ? <Loader2 className="size-4 animate-spin" /> : "Simpan Catatan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ubah Catatan Kas</DialogTitle>
            <DialogDescription>
              Ubah data pengeluaran/pemasukan manual.
            </DialogDescription>
          </DialogHeader>
          {editItem && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipe</Label>
                  <Select value={editItem.tipe} onValueChange={v => setEditItem({ ...editItem, tipe: v as "IN" | "OUT" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OUT">Pengeluaran</SelectItem>
                      <SelectItem value="IN">Pemasukan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nominal (Rp)</Label>
                  <Input type="number" required value={editItem.nominal} onChange={e => setEditItem({ ...editItem, nominal: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Kategori</Label>
                  <Input required value={editItem.kategori} onChange={e => setEditItem({ ...editItem, kategori: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Tanggal</Label>
                  <Input type="date" required value={new Date(editItem.tanggal).toISOString().slice(0,10)} onChange={e => setEditItem({ ...editItem, tanggal: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Keterangan</Label>
                <Textarea required value={editItem.keterangan} onChange={e => setEditItem({ ...editItem, keterangan: e.target.value })} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditItem(null)}>Batal</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : "Simpan Perubahan"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus Catatan Kas</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus catatan kas ini? Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteItem(null)}>Batal</Button>
            <Button type="button" variant="destructive" disabled={submitting} onClick={handleDeleteConfirm}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Hapus Permanen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
