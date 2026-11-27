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
  Textfield,
  Label,
  Spinner,
  SectionMessage,
  Link,
  DynamicTable,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const section = xcss({
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius.200',
  padding: 'space.200',
});

const STATUS = { blocked: ['removed', 'Held'], clear: ['success', 'Cleared'], 'no-hazards': ['default', 'No hazards'] };

function HazardLog({ info, reload }) {
  const [text, setText] = useState('');
  const [pages, setPages] = useState(null);
  const [pick, setPick] = useState(null);
  const [msg, setMsg] = useState('');
  const search = async () => {
    const r = await invoke('findPages', { text });
    setPages(r.pages || []);
    if (r.error) setMsg(r.message);
  };
  const save = async () => {
    const r = await invoke('setPage', { pageId: pick.value });
    setMsg(r.error ? r.message : `Saved. Found ${r.count} hazards.`);
    reload();
  };
  const s = info.settings;
  return (
    <Box xcss={section}>
      <Stack space="space.150">
        <Heading as="h3">1. Hazard log</Heading>
        {s.pageId ? (
          <Text>
            Using <Link href={s.pageUrl} openNewTab>{s.pageTitle}</Link>
            {info.log?.count !== undefined ? `, ${info.log.count} hazards` : ''}.
          </Text>
        ) : (
          <Text>Pick the Confluence page that holds your hazard log, or create the sample data below.</Text>
        )}
        {info.log?.problems?.length ? (
          <SectionMessage appearance="warning" title="Fix these on the page">
            {info.log.problems.map((p) => (
              <Text key={p}>{p}</Text>
            ))}
          </SectionMessage>
        ) : null}
        {info.log?.error ? <Text>{info.log.error}</Text> : null}
        <Text>
          The page needs one table with these columns: <Strong>ID, Hazard, Harm, Severity, Watches, Risk control, Verification</Strong>. Watches lists the Jira components, code paths and words that can cause the hazard.
        </Text>
        <Inline space="space.100" alignBlock="end">
          <Box xcss={xcss({ width: '320px' })}>
            <Label labelFor="q">Page title</Label>
            <Textfield id="q" value={text} onChange={(e) => setText(e.target.value)} placeholder="Hazard log" />
          </Box>
          <Button onClick={search}>Search</Button>
        </Inline>
        {pages ? (
          <Inline space="space.100" alignBlock="end">
            <Box xcss={xcss({ width: '420px' })}>
              <Select options={pages.map((p) => ({ label: `${p.title} (${p.space})`, value: p.id }))} value={pick} onChange={setPick} placeholder={pages.length ? 'Pick a page' : 'No pages found'} />
            </Box>
            <Button appearance="primary" isDisabled={!pick} onClick={save}>
              Use this page
            </Button>
          </Inline>
        ) : null}
        {msg ? <Text>{msg}</Text> : null}
      </Stack>
    </Box>
  );
}

function SampleData({ reload }) {
  const [targets, setTargets] = useState(null);
  const [project, setProject] = useState(null);
  const [space, setSpace] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    invoke('targets').then(setTargets);
  }, []);
  const run = async () => {
    setBusy(true);
    const r = await invoke('createDemo', { projectKey: project.value, spaceId: space.value });
    setBusy(false);
    setResult(r);
    reload();
  };
  return (
    <Box xcss={section}>
      <Stack space="space.150">
        <Heading as="h3">2. Try it with sample data</Heading>
        <Text>Creates a sample infusion pump hazard log in Confluence, 8 verification tests and 8 sample changes in Jira. Use a company-managed project.</Text>
        {!targets ? (
          <Spinner size="small" />
        ) : targets.error ? (
          <Text>{targets.message}</Text>
        ) : (
          <Inline space="space.100" alignBlock="end">
            <Box xcss={xcss({ width: '260px' })}>
              <Label labelFor="p">Jira project</Label>
              <Select id="p" options={targets.projects.map((p) => ({ label: `${p.name} (${p.key})${p.style === 'next-gen' ? ', team-managed' : ''}`, value: p.key }))} value={project} onChange={setProject} />
            </Box>
            <Box xcss={xcss({ width: '260px' })}>
              <Label labelFor="s">Confluence space</Label>
              <Select id="s" options={targets.spaces.map((s) => ({ label: `${s.name} (${s.key})`, value: s.id }))} value={space} onChange={setSpace} />
            </Box>
            <Button appearance="primary" isDisabled={!project || !space || busy} onClick={run}>
              {busy ? 'Creating' : 'Create sample data'}
            </Button>
          </Inline>
        )}
        {result?.error ? (
          <SectionMessage appearance="error" title="Could not create the sample data">
            <Text>{result.message}</Text>
          </SectionMessage>
        ) : null}
        {result?.ok ? (
          <SectionMessage appearance="success" title="Sample data ready">
            {result.steps.map((s) => (
              <Text key={s}>{s}</Text>
            ))}
            <Text>Open {result.changes[0]?.key} ("{result.changes[0]?.summary}") to see the SafeChange panel.</Text>
          </SectionMessage>
        ) : null}
      </Stack>
    </Box>
  );
}

function Gate() {
  return (
    <Box xcss={section}>
      <Stack space="space.100">
        <Heading as="h3">3. Turn on the Done gate</Heading>
        <Text>In your project, open Project settings, then Workflows, and edit the workflow.</Text>
        <Text>Select the transition into Done, then Add rule, and pick the validator "SafeChange hazard gate". Publish the workflow.</Text>
        <Text>From then on, a change that touches a hazard cannot move to Done until every touched hazard has a signed review and a passed, linked test.</Text>
        <Text>Issues with the label "verification" are treated as tests, so the gate never holds them.</Text>
      </Stack>
    </Box>
  );
}

function Recalls({ info, reload }) {
  const [codes, setCodes] = useState((info.settings.productCodes || []).join(', '));
  const [msg, setMsg] = useState('');
  const save = async () => {
    const r = await invoke('setProductCodes', { codes });
    setMsg(`Saved: ${r.productCodes.join(', ') || 'all devices'}`);
    reload();
  };
  return (
    <Box xcss={section}>
      <Stack space="space.150">
        <Heading as="h3">4. FDA recall context</Heading>
        <Text>SafeChange shows real FDA recalls with a software root cause that match each hazard. Narrow them to your device type with FDA product codes (FRN is infusion pumps). Leave empty for all devices.</Text>
        <Inline space="space.100" alignBlock="end">
          <Box xcss={xcss({ width: '220px' })}>
            <Label labelFor="c">Product codes</Label>
            <Textfield id="c" value={codes} onChange={(e) => setCodes(e.target.value)} />
          </Box>
          <Button onClick={save}>Save</Button>
        </Inline>
        {msg ? <Text>{msg}</Text> : null}
      </Stack>
    </Box>
  );
}

function Release() {
  const [jql, setJql] = useState('statusCategory != Done ORDER BY key ASC');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState(null);
  const run = async () => {
    setBusy(true);
    setRes(await invoke('releaseCheck', { jql }));
    setBusy(false);
  };
  const write = async () => {
    setBusy(true);
    setRecord(await invoke('releaseRecord', { jql }));
    setBusy(false);
  };
  return (
    <Box xcss={section}>
      <Stack space="space.150">
        <Heading as="h3">Release check</Heading>
        <Text>See every change in a release that still has hazards not cleared, or write the release safety record to Confluence.</Text>
        <Inline space="space.100" alignBlock="end">
          <Box xcss={xcss({ width: '420px' })}>
            <Label labelFor="j">JQL</Label>
            <Textfield id="j" value={jql} onChange={(e) => setJql(e.target.value)} />
          </Box>
          <Button appearance="primary" onClick={run} isDisabled={busy}>
            {busy ? 'Working' : 'Check'}
          </Button>
          <Button onClick={write} isDisabled={busy}>
            Write safety record
          </Button>
        </Inline>
        {record?.error ? <Text>{record.message}</Text> : null}
        {record?.page ? (
          <SectionMessage appearance="success" title="Release safety record written">
            <Text>
              <Link href={record.page.url} openNewTab>{record.page.title}</Link>: {record.changes} changes, {record.cleared} cleared, {record.held} held, {record.noHazards} touching no hazard.
            </Text>
          </SectionMessage>
        ) : null}
        {res?.error ? <Text>{res.message}</Text> : null}
        {res?.rows ? (
          <Stack space="space.100">
            <Text>
              <Strong>{res.blocked}</Strong> held, <Strong>{res.clear}</Strong> cleared, <Strong>{res.noHazards}</Strong> with no hazards, out of {res.checked} changes.
            </Text>
            <DynamicTable
              head={{ cells: [{ key: 'k', content: 'Change' }, { key: 's', content: 'Summary' }, { key: 'v', content: 'Verdict' }, { key: 'h', content: 'Hazards' }] }}
              rows={res.rows.map((r) => ({
                key: r.key,
                cells: [
                  { key: 'k', content: r.key },
                  { key: 's', content: r.summary },
                  { key: 'v', content: <Lozenge appearance={STATUS[r.status][0]}>{STATUS[r.status][1]}</Lozenge> },
                  { key: 'h', content: r.hazards.map((h) => `${h.id}${h.state === 'ok' ? '' : ' (open)'}`).join(', ') || 'none' },
                ],
              }))}
            />
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
}

function App() {
  const [info, setInfo] = useState(null);
  const reload = async () => setInfo(await invoke('settings'));
  useEffect(() => {
    reload();
  }, []);
  if (!info) return <Spinner label="Loading" />;
  return (
    <Stack space="space.200">
      <Text>SafeChange keeps changes to medical device software from reaching Done until every hazard they touch has a signed risk review and a passed test.</Text>
      <HazardLog info={info} reload={reload} />
      <SampleData reload={reload} />
      <Gate />
      <Recalls info={info} reload={reload} />
      <Release />
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
