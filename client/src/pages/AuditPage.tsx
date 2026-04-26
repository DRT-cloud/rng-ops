import { useQuery } from "@tanstack/react-query";
import { AppLayout, PageHeader, PageBody } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
import type { Audit } from "@shared/schema";
import { fmt12hSec } from "@/lib/format";

export default function AuditPage() {
  const { data: audits = [], isLoading } = useQuery<Audit[]>({ queryKey: ["/api/audits"] });
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const sorted = [...audits].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    if (!qq) return sorted;
    return sorted.filter(a =>
      [a.entityType, a.field, a.oldValue, a.newValue, a.reason]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(qq))
    );
  }, [audits, q]);

  return (
    <AppLayout>
      <PageHeader
        title="Audit Log"
        subtitle="Every timing change, penalty, and status override"
      />
      <PageBody>
        <div className="mb-4 max-w-md">
          <Input
            placeholder="Filter by entity type, field, or reason…"
            value={q}
            onChange={e => setQ(e.target.value)}
            data-testid="input-audit-filter"
          />
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Time</TableHead>
                  <TableHead className="w-32">Entity</TableHead>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead className="w-32">Field</TableHead>
                  <TableHead>Old → New</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No audit entries</TableCell></TableRow>
                ) : filtered.map(a => (
                  <TableRow key={a.id} data-testid={`row-audit-${a.id}`}>
                    <TableCell className="font-mono text-xs">{fmt12hSec(a.timestamp)}</TableCell>
                    <TableCell className="text-sm">{a.entityType}</TableCell>
                    <TableCell className="font-mono text-xs">{a.entityId ?? "—"}</TableCell>
                    <TableCell className="text-sm">{a.field ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {a.oldValue != null && <span className="text-muted-foreground line-through">{a.oldValue}</span>}
                      {a.oldValue != null && a.newValue != null && <span className="mx-1">→</span>}
                      {a.newValue != null && <span className="font-medium">{a.newValue}</span>}
                      {a.oldValue == null && a.newValue == null && <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.reason ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageBody>
    </AppLayout>
  );
}
