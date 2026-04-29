// Step F primitive fixture page. Replaces the Step E theme smoke screen.
//
// Fixture must render every variant of every primitive — its role as Tailwind
// purge canary depends on this. Don't delete sections without auditing.
//
// SOURCE: docs/RNG_Ops_v3_Project_Memory.md §12.4 (buttons, cards, tables) and
// §12.5 (status badges).

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table } from "@/components/ui/Table";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h2 className="font-display font-bold uppercase tracking-display text-rng-text-primary text-2xl">
        {children}
      </h2>
      <span className="rng-accent-bar" />
    </>
  );
}

export default function App() {
  return (
    <main className="min-h-screen p-8 space-y-8">
      <header className="space-y-2">
        <h1 className="font-display font-extrabold uppercase tracking-display text-rng-text-primary text-4xl">
          RNG OPS &mdash; PRIMITIVES
        </h1>
        <span className="rng-accent-bar" />
        <p className="text-rng-text-body">
          Fixture page exercising every variant of every primitive in
          components/ui/. Used as a visual gate during dev/build/preview
          verification and as a Tailwind purge canary at build time.
        </p>
      </header>

      {/* Buttons — §12.4 four variants */}
      <Card className="space-y-4">
        <SectionHeading>BUTTONS</SectionHeading>
        <div className="flex flex-wrap gap-3 pt-1">
          <Button variant="action">APPROVE &amp; RECORD</Button>
          <Button variant="info">EDIT</Button>
          <Button variant="ghost">CANCEL</Button>
          <Button variant="dns">DID NOT SHOOT (DNS)</Button>
        </div>
        <p className="text-rng-text-body text-sm">
          action = Brand Red filled. info = Brand Blue 1.5px outline.
          ghost = transparent + Vapor text. dns = Brand Red 1.5px outline.
        </p>
      </Card>

      {/* Card — §12.4 surface + border + radius + shadow */}
      <Card className="space-y-4">
        <SectionHeading>CARD</SectionHeading>
        <p className="text-rng-text-body">
          The outer container is itself a Card. Below is a nested Card to
          demonstrate composition and visual layering against the Forge Black
          page chrome.
        </p>
        <Card>
          <p className="text-rng-text-body">
            Nested card on a Charcoal Steel surface with Steel Gray border,
            8px radius, and the §12.4 drop shadow.
          </p>
        </Card>
      </Card>

      {/* StatusBadge — §12.5 five states + custom-label override */}
      <Card className="space-y-4">
        <SectionHeading>STATUS BADGES</SectionHeading>
        <div className="flex flex-wrap gap-3 pt-1">
          <StatusBadge variant="pending" />
          <StatusBadge variant="recorded" />
          <StatusBadge variant="edited" />
          <StatusBadge variant="sync_conflict" />
          <StatusBadge variant="synced" />
        </div>
        <p className="text-rng-text-body text-sm">
          Auto-labeled from STATUS_LABELS constant. Custom override via
          children:
        </p>
        <div className="flex flex-wrap gap-3">
          <StatusBadge variant="recorded">RECORDED 14:32</StatusBadge>
        </div>
      </Card>

      {/* Table — §12.4 header / alternating rows / borders, with composed StatusBadge */}
      <Card className="space-y-4">
        <SectionHeading>TABLE</SectionHeading>
        <Table>
          <thead>
            <tr>
              <th>Bib</th>
              <th>Last, First</th>
              <th>Division</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-mono">0101</td>
              <td>ADAMS, DAVID</td>
              <td>2-GUN</td>
              <td>
                <StatusBadge variant="recorded" />
              </td>
            </tr>
            <tr>
              <td className="font-mono">0142</td>
              <td>BAKER, ELLEN</td>
              <td>NV 2-GUN</td>
              <td>
                <StatusBadge variant="edited" />
              </td>
            </tr>
            <tr>
              <td className="font-mono">0203</td>
              <td>CARTER, FRANK</td>
              <td>PCC</td>
              <td>
                <StatusBadge variant="pending" />
              </td>
            </tr>
            <tr>
              <td className="font-mono">0215</td>
              <td>DAWSON, GREG</td>
              <td>PCC</td>
              <td>
                <StatusBadge variant="sync_conflict" />
              </td>
            </tr>
            <tr>
              <td className="font-mono">0308</td>
              <td>EVANS, HENRY</td>
              <td>NV PCC</td>
              <td>
                <StatusBadge variant="synced" />
              </td>
            </tr>
          </tbody>
        </Table>
      </Card>
    </main>
  );
}
