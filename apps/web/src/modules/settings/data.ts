import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type PersonRow = Database["public"]["Tables"]["person"]["Row"];
type TenantRow = Database["public"]["Tables"]["tenant"]["Row"];
type TenantMemberRow = Database["public"]["Tables"]["tenant_member"]["Row"];

interface AppMetadataClaims {
  tenant_id?: string;
  role?: string;
}

interface JwtClaims {
  email?: unknown;
  phone?: unknown;
  app_metadata?: unknown;
}

export interface SettingsTenantMember {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  person: Pick<PersonRow, "vorname" | "nachname" | "email" | "user_id"> | null;
}

export interface SettingsOverviewData {
  account: {
    id: string;
    email: string | null;
    jwtEmail: string | null;
    phone: string | null;
    role: string | null;
    tenantId: string | null;
    createdAt: string | null;
    lastSignInAt: string | null;
  };
  person: PersonRow | null;
  tenant: TenantRow | null;
  tenantMembers: SettingsTenantMember[];
  isTenantAdmin: boolean;
  loadIssues: string[];
}

function readAppMetadata(value: unknown): AppMetadataClaims {
  if (!value || typeof value !== "object") return {};

  const record = value as Record<string, unknown>;
  return {
    tenant_id:
      typeof record.tenant_id === "string" ? record.tenant_id : undefined,
    role: typeof record.role === "string" ? record.role : undefined,
  };
}

function readClaims(value: unknown): JwtClaims {
  if (!value || typeof value !== "object") return {};
  return value as JwtClaims;
}

function mapTenantMembers(
  members: TenantMemberRow[],
  people: Pick<PersonRow, "vorname" | "nachname" | "email" | "user_id">[],
): SettingsTenantMember[] {
  const peopleByUserId = new Map(
    people
      .filter((person) => person.user_id)
      .map((person) => [person.user_id as string, person]),
  );

  return members.map((member) => ({
    id: member.id,
    userId: member.user_id,
    role: member.role,
    createdAt: member.created_at,
    person: peopleByUserId.get(member.user_id) ?? null,
  }));
}

export async function getSettingsOverviewData(): Promise<SettingsOverviewData> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const claims = readClaims(claimsData?.claims);
  const appMetadata = readAppMetadata(claims.app_metadata);
  const tenantId = appMetadata.tenant_id ?? null;
  const role = appMetadata.role ?? null;
  const isTenantAdmin = role === "tenant_admin";
  const loadIssues: string[] = [];

  if (claimsError) {
    console.error("[settings] getClaims failed:", claimsError);
    loadIssues.push("JWT-Claims konnten nicht vollständig geladen werden.");
  }

  const personPromise = supabase
    .from("person")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const tenantPromise = tenantId
    ? supabase.from("tenant").select("*").eq("id", tenantId).maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const memberPromise =
    isTenantAdmin && tenantId
      ? supabase
          .from("tenant_member")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: true })
          .returns<TenantMemberRow[]>()
      : Promise.resolve({ data: [] as TenantMemberRow[], error: null });

  const [personResult, tenantResult, memberResult] = await Promise.all([
    personPromise,
    tenantPromise,
    memberPromise,
  ]);

  if (personResult.error) {
    console.error("[settings] person select failed:", personResult.error);
    loadIssues.push("Verknüpfte Person konnte nicht geladen werden.");
  }
  if (tenantResult.error) {
    console.error("[settings] tenant select failed:", tenantResult.error);
    loadIssues.push("Mandant konnte nicht geladen werden.");
  }
  if (memberResult.error) {
    console.error(
      "[settings] tenant_member select failed:",
      memberResult.error,
    );
    loadIssues.push("Benutzer- und Rollenliste konnte nicht geladen werden.");
  }

  const members = memberResult.data ?? [];
  const memberUserIds = members.map((member) => member.user_id);
  const memberPeopleResult =
    memberUserIds.length > 0
      ? await supabase
          .from("person")
          .select("vorname,nachname,email,user_id")
          .in("user_id", memberUserIds)
          .returns<
            Pick<PersonRow, "vorname" | "nachname" | "email" | "user_id">[]
          >()
      : { data: [], error: null };

  if (memberPeopleResult.error) {
    console.error(
      "[settings] tenant member person select failed:",
      memberPeopleResult.error,
    );
    loadIssues.push("Personendaten zur Rollenliste konnten nicht geladen werden.");
  }

  const jwtEmail = typeof claims.email === "string" ? claims.email : null;
  const phone = typeof claims.phone === "string" ? claims.phone : null;

  return {
    account: {
      id: user.id,
      email: user.email ?? null,
      jwtEmail,
      phone,
      role,
      tenantId,
      createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
    },
    person: personResult.data ?? null,
    tenant: tenantResult.data ?? null,
    tenantMembers: mapTenantMembers(members, memberPeopleResult.data ?? []),
    isTenantAdmin,
    loadIssues,
  };
}
