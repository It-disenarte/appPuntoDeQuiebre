import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { listAdmins } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { formatDate } from "@/lib/billing/labels";
import { getSetting, SETTING_KEYS, type WelcomeVideo } from "@/lib/settings";
import { storageConfigured } from "@/lib/storage";
import { CreateAdminForm } from "./CreateAdminForm";
import { VideoUploader } from "./VideoUploader";

export const metadata: Metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  await requireAdmin();
  const [video, admins] = await Promise.all([getSetting<WelcomeVideo>(SETTING_KEYS.welcomeVideo), listAdmins()]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Panel de administrador" title="Ajustes" />

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-extrabold">Video de bienvenida (Erick)</h2>
          <p className="mt-1 text-sm text-ink-500">Se muestra en la pantalla de compromiso. MP4, WebM o MOV de hasta 500 MB.</p>
        </div>
        {video ? (
          <p className="text-sm">
            Video actual: {(video.size / 1024 / 1024).toFixed(1)} MB · subido el {formatDate(new Date(video.uploadedAt))}
          </p>
        ) : (
          <p className="text-sm text-ink-500">Todavía no hay video.</p>
        )}
        {storageConfigured() ? (
          <VideoUploader />
        ) : (
          <p className="rounded-xl bg-naranja-100 px-4 py-3 text-sm">Configura MinIO (variables S3_*) para poder subir el video.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-extrabold">Administradores</h2>
        <ul className="divide-y divide-ink-200 text-sm">
          {admins.map((a) => (
            <li key={a.id} className="flex justify-between gap-3 py-2.5">
              <span>
                <span className="font-semibold">{a.name}</span> <span className="text-ink-500">· {a.email}</span>
              </span>
              <span className="text-ink-500">{a.lastLoginAt ? `Último acceso ${formatDate(a.lastLoginAt)}` : "Sin acceso aún"}</span>
            </li>
          ))}
        </ul>
        <CreateAdminForm />
      </Card>
    </div>
  );
}
