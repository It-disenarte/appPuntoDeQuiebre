"use client";

import { useActionState } from "react";
import { Button, Field, FormError, FormSuccess } from "@/components/ui";
import { saveCommunityAction, type AdminState } from "@/lib/admin/actions";
import type { Community } from "@/lib/community";

export function CommunityForm({ v }: { v: Community }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(saveCommunityAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state?.error} />
      <FormSuccess message={state?.message} />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Sesión en vivo (enlace)" name="live" defaultValue={v.live ?? ""} placeholder="https://…" />
        <Field label="Cuándo es (texto corto)" name="liveNote" defaultValue={v.liveNote ?? ""} maxLength={160} placeholder="Ej. Jueves 7 p. m." />
        <Field label="Discord (enlace de invitación)" name="discord" defaultValue={v.discord ?? ""} placeholder="https://discord.gg/…" />
        <Field label="WhatsApp (enlace de la comunidad)" name="whatsapp" defaultValue={v.whatsapp ?? ""} placeholder="https://chat.whatsapp.com/…" />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Guardar enlaces"}
      </Button>
      <p className="text-xs text-ink-500">Déjalos vacíos si todavía no existen: los creadores no ven la tarjeta de Comunidad hasta que haya al menos uno.</p>
    </form>
  );
}
