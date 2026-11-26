import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Stack, Inline, Text, Strong, Lozenge, Button, Spinner, SectionMessage, DynamicTable } from '@forge/react';
import { invoke } from '@forge/bridge';

const SEV = { Catastrophic: 'removed', Critical: 'removed', Serious: 'moved', Minor: 'default', Negligible: 'default' };

function App() {
  const [data, setData] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    invoke('status').then(setData);
  }, []);
  if (!data) return <Spinner label="Checking open changes" />;
  if (data.error)
    return (
      <SectionMessage appearance="error" title="SafeChange could not check this page">
        <Text>{data.message}</Text>
      </SectionMessage>
    );
  if (!data.isHazardLog)
    return (
      <SectionMessage appearance="information" title="Not a hazard log">
        <Text>SafeChange reads a page with one table that has an ID column and a Watches column.</Text>
      </SectionMessage>
    );
  const held = data.rows.reduce((n, r) => n + r.open, 0);
  return (
    <Stack space="space.150">
      <Text>
        <Strong>{held}</Strong> hazard reviews still open across <Strong>{data.checked}</Strong> open Jira changes.
      </Text>
      <DynamicTable
        head={{ cells: [{ key: 'h', content: 'Hazard' }, { key: 's', content: 'Severity' }, { key: 'c', content: 'Open changes touching it' }] }}
        rows={data.rows.map((r) => ({
          key: r.hazard.id,
          cells: [
            { key: 'h', content: `${r.hazard.id}: ${r.hazard.title}` },
            { key: 's', content: <Lozenge appearance={SEV[r.hazard.severity] || 'default'}>{r.hazard.severity}</Lozenge> },
            {
              key: 'c',
              content: r.changes.length ? r.changes.map((c) => `${c.key} (${c.blocks ? c.label.toLowerCase() : 'cleared'})`).join(', ') : 'none',
            },
          ],
        }))}
      />
      {data.problems.length ? (
        <SectionMessage appearance="warning" title="Fix these in the table">
          {data.problems.map((p) => (
            <Text key={p}>{p}</Text>
          ))}
        </SectionMessage>
      ) : null}
      {data.isActiveLog || saved ? (
        <Text>This page is the hazard log SafeChange uses in Jira.</Text>
      ) : (
        <Inline>
          <Button appearance="primary" onClick={async () => { const r = await invoke('useThisPage'); if (r.ok) setSaved(true); }}>
            Use this page as the hazard log
          </Button>
        </Inline>
      )}
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
