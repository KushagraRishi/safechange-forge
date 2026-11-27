import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Stack,
  Inline,
  Text,
  Strong,
  Heading,
  Lozenge,
  Button,
  Select,
  TextArea,
  Label,
  Spinner,
  SectionMessage,
  Link,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const SEV = { Catastrophic: 'removed', Critical: 'removed', Serious: 'moved', Minor: 'default', Negligible: 'default' };
const STATE = {
  ok: 'success',
  'missing-review': 'removed',
  'stale-review': 'moved',
  rejected: 'removed',
  'missing-test': 'moved',
  'test-not-passed': 'inprogress',
};
const WHY = { file: 'File', component: 'Component', label: 'Label', word: 'Mentions', model: 'Model reads' };

const card = xcss({
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius.200',
  padding: 'space.150',
});

function Verdict({ gate }) {
  if (gate.status === 'no-hazards')
    return (
      <SectionMessage appearance="success" title="No hazards touched">
        <Text>This change does not touch any hazard in the hazard log. It can move on as normal.</Text>
      </SectionMessage>
    );
  if (gate.status === 'clear')
    return (
      <SectionMessage appearance="success" title={gate.total === 1 ? 'The hazard is cleared' : `All ${gate.total} hazards cleared`}>
        <Text>Every hazard this change touches has a signed review and a passed test.</Text>
      </SectionMessage>
    );
  return (
    <SectionMessage appearance="error" title={`Held at Done: ${gate.open} of ${gate.total} ${gate.total === 1 ? 'hazard' : 'hazards'} not cleared`}>
      <Text>Review each hazard below and link a passed test. Then this change can move to Done.</Text>
    </SectionMessage>
  );
}

function Recalls({ hazardId }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const load = async () => {
    setOpen(true);
    if (!data) setData(await invoke('recalls', { hazardId }));
  };
  if (!open)
    return (
      <Button appearance="subtle" onClick={load}>
        FDA recalls like this
      </Button>
    );
  if (!data) return <Spinner size="small" label="Loading FDA recalls" />;
  if (data.error) return <Text>Could not reach openFDA: {data.message}</Text>;
  return (
    <Stack space="space.075">
      <Text>
        <Strong>{data.total}</Strong> FDA recalls with a software root cause mention the same risks (openFDA, updated {data.updated}).
      </Text>
      {data.items.map((r) => (
        <Stack key={r.id} space="space.025">
          <Text>
            <Strong>{r.firm}</Strong>, {r.date}
          </Text>
          <Text>
            {r.reason.slice(0, 160)}
            {r.reason.length > 160 ? '...' : ''} <Link href={r.url} openNewTab>FDA record</Link>
          </Text>
        </Stack>
      ))}
    </Stack>
  );
}

function ReviewForm({ item, linked, onSigned }) {
  const [decision, setDecision] = useState({ label: 'Risk acceptable', value: 'acceptable' });
  const [note, setNote] = useState('');
  const testOptions = linked.map((l) => ({ label: `${l.key}: ${l.summary} (${l.status})`, value: l.key }));
  const suggested = testOptions.find((o) => o.label.includes(item.hazard.id)) || null;
  const [test, setTest] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const draft = async () => {
    const r = await invoke('draft', { hazardId: item.hazard.id });
    if (r.note) setNote(r.note);
  };
  const sign = async () => {
    setBusy(true);
    setErr('');
    const r = await invoke('sign', { hazardId: item.hazard.id, decision: decision.value, note, testKey: test?.value || '' });
    setBusy(false);
    if (r.error) setErr(r.message);
    else onSigned(r);
  };

  return (
    <Stack space="space.100">
      <Label labelFor={`d-${item.hazard.id}`}>Decision</Label>
      <Select
        id={`d-${item.hazard.id}`}
        value={decision}
        onChange={setDecision}
        options={[
          { label: 'Risk acceptable', value: 'acceptable' },
          { label: 'Risk not acceptable', value: 'not-acceptable' },
        ]}
      />
      <Inline spread="space-between" alignBlock="center">
        <Label labelFor={`n-${item.hazard.id}`}>Why</Label>
        <Button appearance="subtle" onClick={draft}>
          Draft from hazard log
        </Button>
      </Inline>
      <TextArea id={`n-${item.hazard.id}`} minimumRows={5} resize="vertical" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the change does to this hazard, and why the risk is or is not acceptable" />
      <Label labelFor={`t-${item.hazard.id}`}>Verification test</Label>
      <Select id={`t-${item.hazard.id}`} value={test} onChange={setTest} options={testOptions} placeholder={testOptions.length ? 'Pick a linked issue' : 'Link a test issue to this change first'} isClearable />
      {err ? <Text>{err}</Text> : null}
      <Inline space="space.100">
        <Button appearance="primary" onClick={sign} isDisabled={busy || note.trim().length < 10}>
          {busy ? 'Signing' : 'Sign review'}
        </Button>
      </Inline>
    </Stack>
  );
}

function HazardCard({ item, linked, onSigned }) {
  const [reviewing, setReviewing] = useState(false);
  const h = item.hazard;
  return (
    <Box xcss={card}>
      <Stack space="space.100">
        <Inline spread="space-between" alignBlock="center">
          <Inline space="space.100" alignBlock="center">
            <Strong>{h.id}</Strong>
            <Lozenge appearance={SEV[h.severity] || 'default'}>{h.severity}</Lozenge>
          </Inline>
          <Lozenge appearance={STATE[item.state]} isBold>
            {item.label}
          </Lozenge>
        </Inline>
        <Text>{h.title}</Text>
        <Text>
          <Strong>Why it matched: </Strong>
          {item.reasons.map((r) => `${WHY[r.kind]} ${r.detail}`).join(', ')}
        </Text>
        {h.control ? (
          <Text>
            <Strong>Risk control: </Strong>
            {h.control}
          </Text>
        ) : null}
        {item.review ? (
          <Text>
            <Strong>Review: </Strong>
            {item.review.decision === 'acceptable' ? 'acceptable' : 'not acceptable'}, signed by {item.review.reviewerName || 'a reviewer'} on {item.review.reviewedAt.slice(0, 10)}
            {item.review.via === 'rovo' ? ' through Rovo' : ''}
            {item.test ? `. Test ${item.test.key}: ${item.test.status}` : ''}
          </Text>
        ) : null}
        {item.state === 'stale-review' ? <Text>The change was edited after this review, so it needs a fresh one.</Text> : null}
        <Inline space="space.100">
          {item.blocks && item.state !== 'test-not-passed' ? (
            <Button appearance={reviewing ? 'default' : 'primary'} onClick={() => setReviewing(!reviewing)}>
              {reviewing ? 'Cancel' : 'Review risk'}
            </Button>
          ) : null}
          <Recalls hazardId={h.id} />
        </Inline>
        {reviewing ? (
          <ReviewForm
            item={item}
            linked={linked}
            onSigned={(r) => {
              setReviewing(false);
              onSigned(r);
            }}
          />
        ) : null}
      </Stack>
    </Box>
  );
}

function App() {
  const [data, setData] = useState(null);
  const load = async () => setData(await invoke('check'));
  useEffect(() => {
    load();
  }, []);

  if (!data) return <Spinner label="Checking hazards" />;
  if (data.error === 'not-configured')
    return (
      <SectionMessage appearance="information" title="Set up SafeChange">
        <Text>{data.message}</Text>
      </SectionMessage>
    );
  if (data.error)
    return (
      <SectionMessage appearance="error" title="SafeChange could not check this change">
        <Text>{data.message}</Text>
        <Button onClick={load}>Try again</Button>
      </SectionMessage>
    );

  return (
    <Stack space="space.150">
      <Verdict gate={data.gate} />
      {data.suggestions && data.suggestions.length ? (
        <Text>
          <Strong>Also worth a look (not blocking): </Strong>
          {data.suggestions.map((m) => `${m.name} (${m.words.join(', ')})`).join('; ')}
        </Text>
      ) : null}
      {data.model && data.model.length ? (
        <Text>
          <Strong>Model reads this change as: </Strong>
          {data.model.map((m) => `${m.name} (${Math.round(m.p * 100)}%)`).join(', ')}
        </Text>
      ) : null}
      {data.gate.items.map((item) => (
        <HazardCard key={item.hazard.id} item={item} linked={data.linked} onSigned={setData} />
      ))}
      <Inline spread="space-between" alignBlock="center">
        <Text>
          Hazard log: {data.log.page.url ? <Link href={data.log.page.url} openNewTab>{data.log.page.title}</Link> : data.log.page.title} (version {data.log.page.version}, {data.log.count} hazards)
        </Text>
        <Button appearance="subtle" onClick={() => { setData(null); load(); }}>
          Check again
        </Button>
      </Inline>
      {data.log.problems.length ? (
        <SectionMessage appearance="warning" title="Hazard log needs attention">
          {data.log.problems.map((p) => (
            <Text key={p}>{p}</Text>
          ))}
        </SectionMessage>
      ) : null}
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
