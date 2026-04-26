import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RunListData } from "@/lib/api";
import { getPenalties } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

export function PenaltyPanel({ entryId }: { entryId: number }) {
  const { data } = useQuery<RunListData>({ queryKey: ["/api/runlist"] });
  if (!data?.event) return null;
  const defs = getPenalties(data.event);
  const applied = data.penalties.filter(p => p.entryId === entryId);

  async function apply(code: string, label: string, seconds: number) {
    await apiRequest("POST", `/api/penalty/${entryId}`, { code, label, seconds });
    await queryClient.invalidateQueries();
  }
  async function remove(id: number) {
    await apiRequest("DELETE", `/api/penalty/${id}`, {});
    await queryClient.invalidateQueries();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {defs.map(p => (
          <Button
            key={p.code}
            variant="outline"
            size="sm"
            onClick={() => apply(p.code, p.label, p.seconds)}
            data-testid={`button-apply-penalty-${p.code}-${entryId}`}
            className="h-7 text-xs"
          >
            + {p.label} ({p.seconds}s)
          </Button>
        ))}
      </div>
      {applied.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {applied.map(p => (
            <Badge key={p.id} variant="secondary" className="pr-0.5 text-xs">
              {p.label} · {p.seconds}s
              <button onClick={() => remove(p.id)} className="ml-1 hover:text-destructive" data-testid={`button-remove-applied-${p.id}`}>
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
