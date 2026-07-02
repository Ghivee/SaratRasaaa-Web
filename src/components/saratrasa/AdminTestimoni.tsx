'use client';

import * as React from "react";
import { toast } from "sonner";
import { Loader2, MessageSquare, Plus, Trash2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Testimoni } from "./types";
// removed adminFetch import

interface AdminTestimoniProps {
  token: string;
}

export function AdminTestimoni({ token }: AdminTestimoniProps) {
  const [testimonis, setTestimonis] = React.useState<Testimoni[]>([]);
  const [loading, setLoading] = React.useState(true);
  
  // Modal form
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [formLoading, setFormLoading] = React.useState(false);
  const [form, setForm] = React.useState({
    nama: "",
    peran: "",
    pesan: "",
  });
  const [editId, setEditId] = React.useState<string | null>(null);
  const [testimoniToDelete, setTestimoniToDelete] = React.useState<string | null>(null);

  const openAddModal = () => {
    setEditId(null);
    setForm({ nama: "", peran: "", pesan: "" });
    setIsModalOpen(true);
  };

  const openEditModal = (t: Testimoni) => {
    setEditId(t.id);
    setForm({ nama: t.nama, peran: t.peran, pesan: t.pesan });
    setIsModalOpen(true);
  };

  const fetchTestimonis = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/testimoni", {
        headers: { "X-Admin-Token": token }
      });
      if (res.ok) {
        const data = await res.json();
        setTestimonis(data);
      } else {
        toast.error("Gagal mengambil data testimoni");
      }
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan jaringan");
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    if (token) void fetchTestimonis();
  }, [token, fetchTestimonis]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nama.trim() || !form.peran.trim() || !form.pesan.trim()) {
      toast.error("Mohon lengkapi semua data");
      return;
    }

    setFormLoading(true);
    try {
      const isEdit = !!editId;
      const res = await fetch("/api/admin/testimoni", {
        method: isEdit ? "PUT" : "POST",
        headers: { "X-Admin-Token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: editId, rating: 5 }),
      });
      if (res.ok) {
        toast.success(isEdit ? "Testimoni berhasil diperbarui" : "Testimoni berhasil ditambahkan");
        setIsModalOpen(false);
        setForm({ nama: "", peran: "", pesan: "" });
        setEditId(null);
        fetchTestimonis();
      } else {
        toast.error("Gagal menyimpan testimoni");
      }
    } catch (err) {
      toast.error("Terjadi kesalahan saat menyimpan");
    } finally {
      setFormLoading(false);
    }
  }

  async function confirmDelete() {
    if (!testimoniToDelete) return;
    try {
      const res = await fetch(`/api/admin/testimoni?id=${testimoniToDelete}`, {
        method: "DELETE",
        headers: { "X-Admin-Token": token },
      });
      if (res.ok) {
        toast.success("Testimoni dihapus");
        setTestimonis((prev) => prev.filter((t) => t.id !== testimoniToDelete));
      } else {
        toast.error("Gagal menghapus testimoni");
      }
    } catch (err) {
      toast.error("Terjadi kesalahan");
    } finally {
      setTestimoniToDelete(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display text-ink flex items-center gap-2">
            <MessageSquare className="size-6 text-pink-primary" />
            Kelola Testimoni
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Tambahkan atau hapus testimoni relawan yang akan ditampilkan di beranda.
          </p>
        </div>
        <Button onClick={openAddModal} className="gap-2 bg-pink-primary hover:bg-pink-dark">
          <Plus className="size-4" />
          Tambah Testimoni
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="size-6 animate-spin text-pink-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Peran</TableHead>
                    <TableHead>Pesan</TableHead>
                    <TableHead className="w-[100px] text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testimonis.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                        Belum ada testimoni.
                      </TableCell>
                    </TableRow>
                  ) : (
                    testimonis.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.nama}</TableCell>
                        <TableCell>
                          <span className="bg-pink-soft text-pink-dark px-2 py-1 rounded text-xs font-semibold">
                            {t.peran}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[300px] break-words break-all whitespace-normal text-sm leading-relaxed">
                          "{t.pesan}"
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditModal(t)}
                            className="text-amber hover:text-amber/90 hover:bg-amber/10 mr-1"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setTestimoniToDelete(t.id)}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Testimoni" : "Tambah Testimoni Baru"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="t-nama">Nama Relawan</Label>
                <Input
                  id="t-nama"
                  value={form.nama}
                  onChange={(e) => setForm({ ...form, nama: e.target.value })}
                  placeholder="Misal: Dinda Aulia"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-peran">Peran / Judul Event</Label>
                <Input
                  id="t-peran"
                  value={form.peran}
                  onChange={(e) => setForm({ ...form, peran: e.target.value })}
                  placeholder="Misal: Peserta Aksi Serayu"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-pesan">Pesan Testimoni</Label>
              <Textarea
                id="t-pesan"
                value={form.pesan}
                onChange={(e) => setForm({ ...form, pesan: e.target.value })}
                placeholder="Tuliskan pengalaman positif relawan..."
                className="resize-none h-24 max-w-full break-all break-words"
                required
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={formLoading} className="bg-pink-primary">
                {formLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Simpan
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!testimoniToDelete} onOpenChange={(o) => !o && setTestimoniToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Testimoni?</AlertDialogTitle>
            <AlertDialogDescription>
              Yakin ingin menghapus testimoni ini? Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
