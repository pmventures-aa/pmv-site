import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Link2, Plus, UserRound } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import {
  EmptyState,
  Panel,
  Tag,
  inputCls,
  btnPrimary,
  btnOutline,
} from "../../components/admin/ui";
import { toast } from "../../components/kit/toast";

interface Party {
  id: string;
  party_type: "person" | "business";
  display_name: string;
  email?: string | null;
  phone?: string | null;
  entity_type?: string | null;
  primary_contact_party_id?: string | null;
  has_account_access?: number;
}
interface MatterParty {
  id: string;
  title: string;
  status: string;
  party_id?: string | null;
  display_name?: string | null;
  matter_role?: string | null;
}
interface Bundle {
  primary_party_id: string;
  parties: Party[];
  matter_parties: MatterParty[];
}
interface SearchParty {
  id: string;
  party_type: "person" | "business";
  display_name: string;
  email?: string | null;
  linked_user_id?: string | null;
}
const relationOptions = [
  ["spouse", "Spouse"],
  ["partner", "Partner"],
  ["household_member", "Household Member"],
  ["business_partner", "Business Partner"],
  ["contact", "Contact"],
  ["principal", "Principal"],
  ["owner", "Owner"],
  ["authorized_representative", "Authorized Representative"],
  ["other", "Other"],
] as const;

export default function ClientRelationships({
  clientId,
}: {
  clientId: string;
}) {
  const [data, setData] = useState<Bundle | null>(null),
    [mode, setMode] = useState<"person" | "business" | null>(null),
    [busy, setBusy] = useState(false);
  const [person, setPerson] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    relationship_type: "spouse",
  });
  const [business, setBusiness] = useState({
    legal_name: "",
    entity_type: "",
    ein: "",
    state: "",
    primary_contact_party_id: "",
    contact_first_name: "",
    contact_last_name: "",
    contact_email: "",
    contact_phone: "",
    contact_title: "",
    make_profile_business: false,
  });
  const [matter, setMatter] = useState({
    matter_id: "",
    party_id: "",
    matter_role: "Client",
  });
  const [search, setSearch] = useState(""),
    [searchResults, setSearchResults] = useState<SearchParty[]>([]),
    [linkRelation, setLinkRelation] = useState("other");
  const load = useCallback(
    async () =>
      setData(
        await api.get<Bundle>(`/admin/clients/${clientId}/relationships`),
      ),
    [clientId],
  );
  useEffect(() => {
    load().catch((e) =>
      toast.error(
        e instanceof ApiError ? e.message : "Could not load relationships.",
      ),
    );
  }, [load]);
  const people = data?.parties.filter((p) => p.party_type === "person") || [],
    businesses = data?.parties.filter((p) => p.party_type === "business") || [];
  const matters = useMemo(() => {
    const map = new Map<
      string,
      { id: string; title: string; status: string; parties: MatterParty[] }
    >();
    for (const row of data?.matter_parties || []) {
      if (!map.has(row.id))
        map.set(row.id, {
          id: row.id,
          title: row.title,
          status: row.status,
          parties: [],
        });
      if (row.party_id) map.get(row.id)!.parties.push(row);
    }
    return [...map.values()];
  }, [data]);
  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/admin/clients/${clientId}/relationships/people`, person);
      toast.success("Person added and linked.");
      setPerson({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        relationship_type: "spouse",
      });
      setMode(null);
      await load();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Could not add this person.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function addBusiness(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(
        `/admin/clients/${clientId}/relationships/businesses`,
        business,
      );
      toast.success("Business added and linked.");
      setBusiness({
        legal_name: "",
        entity_type: "",
        ein: "",
        state: "",
        primary_contact_party_id: "",
        contact_first_name: "",
        contact_last_name: "",
        contact_email: "",
        contact_phone: "",
        contact_title: "",
        make_profile_business: false,
      });
      setMode(null);
      await load();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Could not add this business.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function attachMatter(e: React.FormEvent) {
    e.preventDefault();
    if (!matter.matter_id || !matter.party_id) return;
    setBusy(true);
    try {
      await api.post(
        `/admin/clients/${clientId}/matters/${matter.matter_id}/parties`,
        { party_id: matter.party_id, matter_role: matter.matter_role },
      );
      toast.success("Relationship added to the matter.");
      await load();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Could not update the matter.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function findExisting() {
    if (search.trim().length < 2) return;
    try {
      const r = await api.get<{ parties: SearchParty[] }>(
        `/admin/relationship-parties/search?q=${encodeURIComponent(search.trim())}`,
      );
      setSearchResults(r.parties || []);
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.message
          : "Could not search relationship records.",
      );
    }
  }
  async function linkExisting(partyId: string) {
    setBusy(true);
    try {
      await api.post(`/admin/clients/${clientId}/relationships/link`, {
        party_id: partyId,
        relationship_type: linkRelation,
      });
      toast.success("Existing record linked without creating a duplicate.");
      setSearchResults([]);
      setSearch("");
      await load();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Could not link this record.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <Panel>
        <p className="text-sm text-slate-400">
          Loading people, businesses, and matters…
        </p>
      </Panel>
    );
  return (
    <div className="space-y-7">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.15em] text-gold/80">
                People
              </p>
              <h2 className="mt-2 text-lg font-extrabold text-white">
                Individuals in This Relationship
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Keep each person separate, then connect spouses, partners,
                representatives, or principals as the relationship develops.
              </p>
            </div>
            <button className={btnOutline} onClick={() => setMode("person")}>
              <Plus size={14} /> Add
            </button>
          </div>
          <div className="mt-5 divide-y divide-white/[.06]">
            {people.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-sky-400/10 text-sky-300">
                    <UserRound size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">
                      {p.display_name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {p.email || p.phone || "No contact details yet"}
                    </p>
                  </div>
                </div>
                {p.has_account_access ? (
                  <Tag tone="green">Portal Account</Tag>
                ) : (
                  <Tag tone="slate">Contact Only</Tag>
                )}
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.15em] text-gold/80">
                Businesses
              </p>
              <h2 className="mt-2 text-lg font-extrabold text-white">
                Organizations Served
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                A business can list an optional contact person. Add other
                principals or owners without replacing that contact.
              </p>
            </div>
            <button className={btnOutline} onClick={() => setMode("business")}>
              <Plus size={14} /> Add
            </button>
          </div>
          <div className="mt-5 divide-y divide-white/[.06]">
            {businesses.length ? (
              businesses.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-gold/10 text-gold">
                    <Building2 size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-white">
                      {p.display_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {p.entity_type || "Business"} · Contact:{" "}
                      {people.find((x) => x.id === p.primary_contact_party_id)
                        ?.display_name &&
                      p.primary_contact_party_id !== data?.primary_party_id
                        ? people.find((x) => x.id === p.primary_contact_party_id)
                            ?.display_name
                        : "No contact listed"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState label="No connected businesses yet." />
            )}
          </div>
        </Panel>
      </div>
      {mode === "person" && (
        <Panel className="!border-sky-400/20">
          <form onSubmit={addPerson}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-white">
                Add a Person
              </h2>
              <button
                type="button"
                className="text-sm text-slate-400"
                onClick={() => setMode(null)}
              >
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="First Name">
                <input
                  className={inputCls}
                  required
                  value={person.first_name}
                  onChange={(e) =>
                    setPerson({ ...person, first_name: e.target.value })
                  }
                />
              </Field>
              <Field label="Last Name">
                <input
                  className={inputCls}
                  required
                  value={person.last_name}
                  onChange={(e) =>
                    setPerson({ ...person, last_name: e.target.value })
                  }
                />
              </Field>
              <Field label="Email">
                <input
                  className={inputCls}
                  type="email"
                  value={person.email}
                  onChange={(e) =>
                    setPerson({ ...person, email: e.target.value })
                  }
                />
              </Field>
              <Field label="Phone">
                <input
                  className={inputCls}
                  value={person.phone}
                  onChange={(e) =>
                    setPerson({ ...person, phone: e.target.value })
                  }
                />
              </Field>
              <Field label="Relationship">
                <select
                  className={inputCls}
                  value={person.relationship_type}
                  onChange={(e) =>
                    setPerson({ ...person, relationship_type: e.target.value })
                  }
                >
                  {relationOptions.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <button className={`${btnPrimary} mt-5`} disabled={busy}>
              Add & Link Person
            </button>
          </form>
        </Panel>
      )}
      {mode === "business" && (
        <Panel className="!border-gold/20">
          <form onSubmit={addBusiness}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-white">
                Add a Business
              </h2>
              <button
                type="button"
                className="text-sm text-slate-400"
                onClick={() => setMode(null)}
              >
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Legal Business Name">
                <input
                  className={inputCls}
                  required
                  value={business.legal_name}
                  onChange={(e) =>
                    setBusiness({ ...business, legal_name: e.target.value })
                  }
                />
              </Field>
              <Field label="Entity Type">
                <input
                  className={inputCls}
                  value={business.entity_type}
                  onChange={(e) =>
                    setBusiness({ ...business, entity_type: e.target.value })
                  }
                />
              </Field>
              <Field label="EIN">
                <input
                  className={inputCls}
                  value={business.ein}
                  onChange={(e) =>
                    setBusiness({ ...business, ein: e.target.value })
                  }
                />
              </Field>
              <Field label="State">
                <input
                  className={inputCls}
                  value={business.state}
                  onChange={(e) =>
                    setBusiness({ ...business, state: e.target.value })
                  }
                />
              </Field>
              <Field label="Optional Contact Person">
                <select
                  className={inputCls}
                  value={business.primary_contact_party_id}
                  onChange={(e) =>
                    setBusiness({
                      ...business,
                      primary_contact_party_id: e.target.value,
                    })
                  }
                >
                  <option value="">No named contact</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Or new contact first name">
                <input
                  className={inputCls}
                  placeholder="Optional"
                  value={business.contact_first_name}
                  onChange={(e) =>
                    setBusiness({
                      ...business,
                      contact_first_name: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="New contact last name">
                <input
                  className={inputCls}
                  placeholder="Optional"
                  value={business.contact_last_name}
                  onChange={(e) =>
                    setBusiness({
                      ...business,
                      contact_last_name: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="New contact title">
                <input
                  className={inputCls}
                  placeholder="Optional"
                  value={business.contact_title}
                  onChange={(e) =>
                    setBusiness({ ...business, contact_title: e.target.value })
                  }
                />
              </Field>
              <Field label="New contact email">
                <input
                  className={inputCls}
                  type="email"
                  placeholder="Optional"
                  value={business.contact_email}
                  onChange={(e) =>
                    setBusiness({ ...business, contact_email: e.target.value })
                  }
                />
              </Field>
              <Field label="New contact phone">
                <input
                  className={inputCls}
                  placeholder="Optional"
                  value={business.contact_phone}
                  onChange={(e) =>
                    setBusiness({ ...business, contact_phone: e.target.value })
                  }
                />
              </Field>
              <label className="flex items-center gap-3 self-end rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={business.make_profile_business}
                  onChange={(e) =>
                    setBusiness({
                      ...business,
                      make_profile_business: e.target.checked,
                    })
                  }
                />{" "}
                Make this the account’s primary business
              </label>
            </div>
            <button
              className={`${btnPrimary} mt-5`}
              disabled={busy}
            >
              Add Business
            </button>
          </form>
        </Panel>
      )}
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.15em] text-gold/80">Link Existing</p>
            <h2 className="mt-2 text-lg font-extrabold text-white">Already in Pinnacle?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Search before adding a duplicate. This is how a later conversation with a spouse, principal, or business joins the right history.</p>
          </div>
          <div className="grid w-full gap-2 sm:w-auto sm:min-w-[520px] sm:grid-cols-[1fr_180px_auto]">
            <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Name or Email" />
            <select className={inputCls} value={linkRelation} onChange={(e) => setLinkRelation(e.target.value)}>{relationOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
            <button className={btnOutline} onClick={() => void findExisting()}>Search</button>
          </div>
        </div>
        {searchResults.length > 0 && <div className="mt-5 divide-y divide-white/[.06] border-y border-white/10">{searchResults.map((result) => <div key={result.id} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-bold text-white">{result.display_name}</p><p className="text-xs text-slate-500">{result.email || result.party_type}</p></div><button className={btnOutline} disabled={busy || data.parties.some((party) => party.id === result.id)} onClick={() => void linkExisting(result.id)}>{data.parties.some((party) => party.id === result.id) ? 'Already Linked' : 'Link Record'}</button></div>)}</div>}
      </Panel>
      <Panel>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-400/10 text-violet-300">
            <Link2 size={18} />
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-white">
              Who Is Involved in Each Matter?
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Attach the right people or business to each matter so personal,
              joint, and business work stay distinct.
            </p>
          </div>
        </div>
        {matters.length ? (
          <>
            <form
              onSubmit={attachMatter}
              className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]"
            >
              <select
                className={inputCls}
                value={matter.matter_id}
                onChange={(e) =>
                  setMatter({ ...matter, matter_id: e.target.value })
                }
              >
                <option value="">Choose matter</option>
                {matters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
              <select
                className={inputCls}
                value={matter.party_id}
                onChange={(e) =>
                  setMatter({ ...matter, party_id: e.target.value })
                }
              >
                <option value="">Choose person or business</option>
                {data.parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
              <input
                className={inputCls}
                value={matter.matter_role}
                onChange={(e) =>
                  setMatter({ ...matter, matter_role: e.target.value })
                }
              />
              <button className={btnPrimary} disabled={busy}>
                Attach
              </button>
            </form>
            <div className="mt-5 divide-y divide-white/[.06]">
              {matters.map((r) => (
                <div key={r.id} className="py-3">
                  <div className="flex justify-between">
                    <p className="text-sm font-bold text-white">{r.title}</p>
                    <Tag tone={r.status === "closed" ? "slate" : "green"}>
                      {r.status}
                    </Tag>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.parties.length ? (
                      r.parties.map((p) => (
                        <span
                          key={`${p.party_id}-${p.matter_role}`}
                          className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300"
                        >
                          {p.display_name} · {p.matter_role}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">
                        No relationships attached yet.
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState label="No matters are available for relationship assignment." />
        )}
      </Panel>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-bold text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}
