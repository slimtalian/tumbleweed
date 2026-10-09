"""Tumbleweed Local. Python standard library only; all writes stay on this computer."""
import argparse
import base64
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timezone
import zipfile
import posixpath
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent
MAX_BYTES = 24 * 1024 * 1024
MAX_WORKSPACE_BYTES = 128 * 1024 * 1024
MAX_RESTORE_BYTES = MAX_WORKSPACE_BYTES + 1024 * 1024

def now():
    return datetime.now(timezone.utc).isoformat()

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

def require(condition, message):
    if not condition:
        raise ValueError(message)

def validate_display_fields(r):
    for field in ('title', 'summary', 'collection', 'status', 'kind', 'coverage', 'url', 'next_action', 'stopped_at', 'put_away', 'decision_rationale', 'decision_alternatives', 'decision_review_on'):
        require(field not in r or isinstance(r[field], str), f'{field} must be text.')
    require(isinstance(r.get('topics', []), list) and all(isinstance(t, str) for t in r.get('topics', [])), 'Topics must be strings.')
    require(isinstance(r.get('tasks', []), list) and all(isinstance(t, dict) and isinstance(t.get('text'), str) and isinstance(t.get('done'), bool) for t in r.get('tasks', [])), 'Invalid tasks.')
    for task in r.get('tasks', []):
        require('context_id' not in task or isinstance(task['context_id'], str), 'Task context must be a record ID.')
        require('context_reason' not in task or isinstance(task['context_reason'], str), 'Task context reason must be text.')
    if r.get('decision_review_on'):
        try:
            datetime.strptime(r['decision_review_on'], '%Y-%m-%d')
        except (ValueError, TypeError):
            raise ValueError('Decision review date must be YYYY-MM-DD.')
    require('archived' not in r or isinstance(r['archived'], bool), 'Archived must be true or false.')

def validate_graph(g):
    require(isinstance(g, dict) and g.get('schema_version') == '1.0', 'Expected a curated schema_version 1.0 graph.')
    for kind in ('records', 'sources', 'edges'):
        rows = g.get(kind)
        require(isinstance(rows, list) and len(rows) <= 10000, f'Invalid {kind} collection.')
        ids = set()
        for r in rows:
            require(isinstance(r, dict) and isinstance(r.get('id'), str) and 0 < len(r['id']) < 500, f'Invalid {kind} ID.')
            require(r['id'] not in ids, f'Duplicate {kind} ID: {r["id"]}')
            ids.add(r['id'])
            if kind != 'edges':
                require(r.get('sensitivity') == 'general', 'Only explicitly general records and sources can be imported here.')
                require(isinstance(r.get('title'), str), 'Every record/source needs a title.')
    records = {r['id'] for r in g['records']}
    sources = {s['id'] for s in g['sources']}
    def refs(r):
        require(isinstance(r.get('source_ids', []), list), 'Invalid source references.')
        require(all(isinstance(x, str) and x in sources for x in r.get('source_ids', [])), 'Unresolved source reference.')
    for r in g['records']:
        validate_display_fields(r)
        refs(r)
        require(isinstance(r.get('summary', ''), str), 'Record summary must be text.')
        require(isinstance(r.get('topics', []), list) and all(isinstance(t, str) for t in r.get('topics', [])), 'Topics must be strings.')
        require(isinstance(r.get('claims', []), list), 'Claims must be a list.')
        for c in r.get('claims', []):
            require(isinstance(c, dict), 'Invalid claim.')
            require(isinstance(c.get('text', ''), str) and isinstance(c.get('status', ''), str), 'Claim text and status must be text.')
            refs(c)
        require(isinstance(r.get('messages', []), list), 'Messages must be a list.')
        for m in r.get('messages', []):
            require(isinstance(m, dict) and isinstance(m.get('text'), str) and isinstance(m.get('role'), str), 'Invalid message text or role.')
            require(m.get('timestamp') is None or isinstance(m['timestamp'], str), 'Invalid message timestamp.')
    for e in g['edges']:
        require(isinstance(e.get('from'), str) and isinstance(e.get('to'), str) and e['from'] in records and e['to'] in records, 'Unresolved relationship endpoint.')
        require(isinstance(e.get('relation'), str), 'Relationship needs a type.')
        require(isinstance(e.get('rationale', ''), str), 'Relationship rationale must be text.')
        require(e.get('basis', 'inferred') in ('explicit', 'inferred'), 'Invalid relationship basis.')
        refs(e)
    return g

def graph_items(g, ns):
    result = {'records': {}, 'sources': {}, 'edges': {}}
    key = lambda x: ns + '::' + x
    for raw in g['records']:
        result['records'][key(raw['id'])] = {'id': key(raw['id']), 'external_id': raw['id'], 'namespace': ns, 'imported': True, 'raw': raw, 'annotations': {}}
    for raw in g['sources']:
        result['sources'][key(raw['id'])] = {'id': key(raw['id']), 'namespace': ns, 'external_id': raw['id'], 'raw': raw}
    for raw in g['edges']:
        result['edges'][key(raw['id'])] = {'id': key(raw['id']), 'namespace': ns, 'external_id': raw['id'], 'from': key(raw['from']), 'to': key(raw['to']), 'relation': raw['relation'], 'basis': raw.get('basis', 'inferred'), 'rationale': raw.get('rationale', ''), 'raw': raw}
    return result

def validate_state(s):
    require(isinstance(s, dict) and s.get('format') == 'tumbleweed-local-1', 'This is not a Tumbleweed Local backup.')
    require(type(s.get('revision')) is int and s['revision'] >= 0, 'Invalid revision.')
    for group in ('records', 'sources', 'edges'):
        require(isinstance(s.get(group), dict) and len(s[group]) <= 30000, f'Invalid {group}.')
        for k, v in s[group].items():
            require(isinstance(v, dict) and v.get('id') == k, f'Invalid {group} identity.')
    namespaces = set()
    for group in ('records', 'sources', 'edges'):
        for item in s[group].values():
            if item.get('namespace') is not None or item.get('imported') or group == 'sources':
                ns = item.get('namespace')
                require(isinstance(ns, str) and re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,63}', ns) and ns not in ('local', 'local-edge'), 'Invalid bundle namespace.')
                require(isinstance(item.get('raw'), dict), 'Imported items must retain their original source data.')
                namespaces.add(ns)
    for ns in namespaces:
        require(isinstance(ns, str), 'Missing bundle namespace.')
        graph = validate_graph({'schema_version': '1.0', **{group: [v['raw'] for v in s[group].values() if v.get('namespace') == ns] for group in ('records', 'sources', 'edges')}})
        for group, rows in graph_items(graph, ns).items():
            for key, expected in rows.items():
                require(key in s[group], 'Imported identity does not match its namespace and original ID.')
                actual = copy.deepcopy(s[group][key])
                if group == 'records':
                    actual['annotations'] = {}
                require(actual == expected, 'Imported evidence mapping has been changed.')
    for r in s['records'].values():
        require(isinstance(r.get('annotations', {}), dict), 'Invalid annotations.')
        display = r.get('annotations', {}) if r.get('imported') else r
        validate_display_fields(display)
        for task in display.get('tasks', []):
            if task.get('context_id'):
                require(task['context_id'] in s['records'], 'Missing task context record.')
        if not r.get('imported'):
            require(isinstance(r.get('title'), str) and r.get('kind') in ('project', 'note', 'experience', 'resource', 'decision'), 'Invalid local record.')
    for e in s['edges'].values():
        require(e.get('from') in s['records'] and e.get('to') in s['records'], 'Backup has broken relationships.')
        require(isinstance(e.get('relation'), str) and bool(e['relation'].strip()), 'Invalid relationship.')
        require(e.get('basis') in ('explicit', 'inferred') and isinstance(e.get('rationale', ''), str), 'Invalid relationship evidence.')
    require(isinstance(s.get('batches'), list) and isinstance(s.get('bundles'), dict), 'Invalid import history.')
    for b in s['batches']:
        require(isinstance(b, dict) and all(isinstance(b.get(k), str) for k in ('id', 'date', 'namespace')) and isinstance(b.get('count'), int) and isinstance(b.get('changes'), list), 'Invalid import batch.')
        for change in b['changes']:
            require(isinstance(change, dict) and change.get('group') in ('records', 'sources', 'edges') and isinstance(change.get('id'), str) and isinstance(change.get('after_hash'), str) and 'before' in change, 'Invalid import change.')
    return s

class Store:
    def __init__(self, folder):
        self.folder = Path(folder)
        self.folder.mkdir(parents=True, exist_ok=True)
        self.path = self.folder / 'workspace.json'
        self.lock = threading.RLock()
        self.previews = {}
        if self.path.exists():
            self.state = validate_state(json.loads(self.path.read_text(encoding='utf8')))
        else:
            self.state = {'format': 'tumbleweed-local-1', 'revision': 0, 'records': {}, 'sources': {}, 'edges': {}, 'batches': [], 'bundles': {}}
            self.write()

    def write(self):
        validate_state(self.state)
        serialized = json.dumps(self.state, ensure_ascii=False, indent=2).encode('utf8')
        require(len(serialized) <= MAX_WORKSPACE_BYTES, 'Workspace exceeds the 128 MB limit. This change was not saved. Keep this collection and start a separate workspace for more material.')
        if self.path.exists():
            backups = self.folder / 'backups'
            backups.mkdir(exist_ok=True)
            name = datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.json'
            (backups / name).write_bytes(self.path.read_bytes())
        temp = self.folder / 'workspace.pending'
        with temp.open('wb') as f:
            f.write(serialized)
            f.flush()
            os.fsync(f.fileno())
        # File indexing or antivirus can briefly hold a Windows destination open.
        # Retry the atomic replace; never fall back to truncating the saved file.
        for attempt in range(5):
            try:
                os.replace(temp, self.path)
                break
            except PermissionError:
                if attempt == 4:
                    raise
                time.sleep(.05 * (attempt + 1))

    def merge(self, g, ns, accepted, initial=False):
        incoming = graph_items(g, ns)
        require(isinstance(accepted, list), 'Invalid conflict selections.')
        approved = set()
        for choice in accepted:
            if isinstance(choice, dict):
                group, key = choice.get('group'), choice.get('id')
                require(isinstance(group, str) and group in incoming and isinstance(key, str) and key in incoming[group], 'Invalid conflict selection.')
            else:
                # Older clients used only an ID. Never let that approve two item types.
                require(isinstance(choice, str), 'Invalid conflict selection.')
                matches = [group for group in incoming if choice in incoming[group]]
                require(len(matches) == 1, 'This conflict ID occurs in multiple item types. Reload and preview again.')
                group, key = matches[0], choice
            approved.add((group, key))
        bundle_before = copy.deepcopy(self.state['bundles'].get(ns))
        changes = []
        for group, rows in incoming.items():
            for key, value in rows.items():
                old = self.state[group].get(key)
                if old and digest(old.get('raw')) == digest(value.get('raw')):
                    continue
                if old and (group, key) not in approved:
                    continue
                if old and group == 'records':
                    value['annotations'] = copy.deepcopy(old.get('annotations', {}))
                changes.append({'group': group, 'id': key, 'before': copy.deepcopy(old), 'after_hash': digest(value)})
                self.state[group][key] = value
        if changes:
            self.state['bundles'].setdefault(ns, {})['metadata'] = {k: v for k, v in g.items() if k not in ('records', 'sources', 'edges')}
            self.state['bundles'][ns]['metadata_scope'] = 'Incoming import metadata; individual records may retain earlier versions when conflicts are declined.'
            self.state['batches'].append({'id': secrets.token_hex(8), 'date': now(), 'namespace': ns, 'changes': changes, 'count': len(changes), 'initial': initial, 'rolled_back': False, 'bundle_before': bundle_before, 'bundle_after_hash': digest(self.state['bundles'][ns])})
        return len(changes)

    def preview(self, g, ns):
        validate_graph(g)
        require(isinstance(ns, str) and re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,63}', ns), 'Use a namespace containing lowercase letters, numbers, dashes or underscores.')
        require(ns not in ('local', 'local-edge'), 'That namespace is reserved for locally created work.')
        result = {'new': 0, 'unchanged': 0, 'conflicts': [], 'records': len(g['records']), 'sources': len(g['sources']), 'edges': len(g['edges']), 'namespace': ns}
        for group, rows in graph_items(g, ns).items():
            for key, val in rows.items():
                old = self.state[group].get(key)
                if old is None:
                    result['new'] += 1
                elif digest(old.get('raw')) == digest(val.get('raw')):
                    result['unchanged'] += 1
                else:
                    result['conflicts'].append({'id': key, 'group': group, 'before': old['raw'], 'after': val['raw']})
        token = secrets.token_hex(16)
        if len(self.previews) > 10:
            self.previews.clear()
        self.previews[token] = (g, ns, self.state['revision'])
        return {**result, 'token': token}

    def mutate(self, req):
        with self.lock:
            require(isinstance(req, dict), 'Expected a JSON object.')
            require(req.get('revision') == self.state['revision'], 'Workspace changed in another window. Reload before saving.')
            previous = copy.deepcopy(self.state)
            try:
                self.apply(req)
                if self.state != previous:
                    self.state['revision'] += 1
                    self.write()
            except Exception:
                self.state = previous
                raise
            return self.state

    def apply(self, req):
        action = req.get('action')
        if action == 'save-record':
            value = req.get('record', {})
            require(isinstance(value, dict), 'Record must be an object.')
            key = value.get('id') or 'local::' + secrets.token_hex(12)
            old = self.state['records'].get(key)
            require(not value.get('id') or old is not None, 'This record no longer exists. Reload before editing.')
            fields = ('title', 'summary', 'topics', 'kind', 'status', 'next_action', 'stopped_at', 'put_away', 'tasks', 'url', 'collection', 'decision_rationale', 'decision_alternatives', 'decision_review_on')
            allowed = {k: value[k] for k in fields if k in value}
            for field in ('title', 'summary', 'next_action', 'stopped_at', 'put_away', 'url', 'collection', 'decision_rationale', 'decision_alternatives', 'decision_review_on'):
                require(isinstance(allowed.get(field, ''), str), f'{field} must be text.')
            require(bool(allowed.get('title', '').strip()), 'A title is required.')
            require((old and old.get('imported')) or allowed.get('kind') in ('project', 'note', 'experience', 'resource', 'decision'), 'Choose a valid kind.')
            require(isinstance(allowed.get('topics', []), list) and all(isinstance(t, str) for t in allowed.get('topics', [])), 'Invalid topics.')
            require(isinstance(allowed.get('tasks', []), list) and all(isinstance(t, dict) and isinstance(t.get('text'), str) and isinstance(t.get('done'), bool) for t in allowed.get('tasks', [])), 'Invalid tasks.')
            if old and old.get('imported'):
                old['annotations'] = {**old.get('annotations', {}), **allowed, 'updated_at': now()}
            else:
                self.state['records'][key] = {**(old or {}), **allowed, 'id': key, 'imported': False, 'created_at': (old or {}).get('created_at', now()), 'updated_at': now()}
            if req.get('origin'):
                require(req['origin'] in self.state['records'] and req['origin'] != key, 'Original context record is unavailable.')
                eid = 'local-edge::' + secrets.token_hex(12)
                self.state['edges'][eid] = {'id': eid, 'from': req['origin'], 'to': key, 'relation': 'informs', 'basis': 'explicit', 'rationale': 'Selected as context when creating this local record.', 'created_at': now()}
        elif action == 'gather':
            ids = req.get('ids')
            require(isinstance(ids, list) and 1 <= len(ids) <= 100 and all(isinstance(x, str) for x in ids), 'Select 1–100 records.')
            ids = list(dict.fromkeys(ids))
            for key in ids:
                require(key in self.state['records'], 'A selected record is unavailable. Refresh and review your selection.')
                record = self.state['records'][key]
                require(not record.get('annotations', {}).get('archived', record.get('archived', False)), 'Unarchive selected records before gathering them.')
            rationale = req.get('rationale', '')
            require(isinstance(rationale, str) and 0 < len(rationale.strip()) <= 4000, 'Explain why these records belong with the project.')
            project_id = req.get('project_id')
            if project_id:
                require(isinstance(project_id, str), 'Invalid project.')
                project = self.state['records'].get(project_id, {})
                require(project.get('kind') == 'project' and not project.get('imported') and not project.get('archived'), 'Choose an available local project.')
            else:
                title, next_action = req.get('title', ''), req.get('next_action', '')
                require(isinstance(title, str) and 0 < len(title.strip()) <= 500, 'Name the project.')
                require(isinstance(next_action, str) and len(next_action) <= 4000, 'Next action must be text.')
                project_id = 'local::' + secrets.token_hex(12)
                topics = set()
                for key in ids:
                    r = self.state['records'][key]
                    topics.update(r.get('annotations', {}).get('topics', r.get('raw', r).get('topics', [])))
                self.state['records'][project_id] = {'id': project_id, 'imported': False, 'kind': 'project', 'title': title.strip(), 'summary': '', 'status': 'planned', 'topics': sorted(topics), 'tasks': [], 'next_action': next_action.strip(), 'created_at': now(), 'updated_at': now()}
            require(project_id not in ids, 'A project cannot be gathered into itself.')
            for key in ids:
                if any(e['from'] == key and e['to'] == project_id and e['relation'] == 'informs' for e in self.state['edges'].values()):
                    continue
                eid = 'local-edge::' + secrets.token_hex(12)
                self.state['edges'][eid] = {'id': eid, 'from': key, 'to': project_id, 'relation': 'informs', 'basis': 'explicit', 'rationale': rationale.strip(), 'created_at': now()}
        elif action == 'archive-record':
            r = self.state['records'][req['id']]
            if r.get('imported'):
                r.setdefault('annotations', {})['archived'] = bool(req.get('archived'))
            else:
                r['archived'] = bool(req.get('archived'))
        elif action == 'link':
            e = req['edge']
            require(e.get('from') in self.state['records'] and e.get('to') in self.state['records'] and e['from'] != e['to'], 'Choose two different records.')
            require(isinstance(e.get('relation'), str) and bool(e['relation'].strip()) and isinstance(e.get('rationale'), str) and bool(e['rationale'].strip()), 'Relationship type and rationale are required.')
            require(e.get('basis') in ('explicit', 'inferred'), 'Select the relationship basis.')
            require(not any(x['from'] == e['from'] and x['to'] == e['to'] and x['relation'] == e['relation'] for x in self.state['edges'].values()), 'This relationship already exists.')
            key = 'local-edge::' + secrets.token_hex(12)
            self.state['edges'][key] = {k: e[k] for k in ('from', 'to', 'relation', 'rationale', 'basis')}
            self.state['edges'][key].update(id=key, created_at=now())
        elif action == 'unlink':
            e = self.state['edges'][req['id']]
            require(not e.get('namespace'), 'Imported evidence is retained. Reimport or undo its batch instead.')
            del self.state['edges'][req['id']]
        elif action == 'import':
            require(req.get('token') in self.previews, 'Preview expired. Preview the file again.')
            g, ns, revision = self.previews[req['token']]
            require(revision == self.state['revision'], 'Workspace changed since preview. Preview again.')
            self.merge(g, ns, req.get('accepted', []))
        elif action == 'undo-import':
            batch = next((b for b in self.state['batches'] if b['id'] == req['id']), None)
            require(batch is not None and not batch.get('rolled_back'), 'Import batch is unavailable.')
            if 'bundle_after_hash' in batch:
                require(digest(self.state['bundles'].get(batch['namespace'])) == batch['bundle_after_hash'], 'A newer import changed this bundle. Undo its newer imports first.')
            for change in batch['changes']:
                current = self.state[change['group']].get(change['id'])
                require(digest(current) == change['after_hash'], 'An imported item was edited or reimported. Undo would erase newer work; export a backup and review it first.')
            for change in reversed(batch['changes']):
                if change['before'] is None:
                    self.state[change['group']].pop(change['id'], None)
                else:
                    self.state[change['group']][change['id']] = change['before']
            batch['rolled_back'] = True
            if 'bundle_before' in batch:
                if batch['bundle_before'] is None:
                    self.state['bundles'].pop(batch['namespace'], None)
                else:
                    self.state['bundles'][batch['namespace']] = batch['bundle_before']
            # validate_state below also blocks removal of records linked by newer work.
        elif action == 'restore':
            restored = validate_state(copy.deepcopy(req['backup']))
            restored['revision'] = self.state['revision']
            self.state = restored
        else:
            raise ValueError('Unknown operation.')

def eligible_note_path(path):
    require(isinstance(path, str), 'Note path must be text.')
    path = path.replace('\\', '/')
    parts = path.split('/')
    require(not path.startswith('/') and '..' not in parts and ':' not in path and all(parts), 'Invalid note path.')
    if any(p.startswith('.') or p.lower() in ('optional_sensitive', 'tools', 'raw_export', 'raw-exports', 'staging') for p in parts):
        return None
    require(path.lower().endswith('.md'), 'Only Markdown files are accepted.')
    return path


def markdown_prose(content):
    """Ignore metadata and code when deriving titles, topics, and backlinks."""
    content = re.sub(r'\A\ufeff?---[^\S\n]*\n.*?\n---[^\S\n]*(?:\n|$)', '', content, count=1, flags=re.S)
    lines, fence = [], None
    for line in content.splitlines():
        match = re.match(r'^ {0,3}(`{3,}|~{3,})(.*)$', line)
        if fence:
            if match and match[1][0] == fence[0] and len(match[1]) >= len(fence) and not match[2].strip():
                fence = None
            lines.append('')
        elif match:
            fence = match[1]
            lines.append('')
        else:
            lines.append(line)
    return re.sub(r'(`+).*?\1', '', '\n'.join(lines))


def markdown_graph(files):
    require(isinstance(files, list) and 0 < len(files) <= 2000, 'Choose 1–2,000 Markdown files.')
    records, sources, edges = [], [], []
    paths = {}
    unresolved = []
    for f in files:
        require(isinstance(f, dict), 'Invalid Markdown file.')
        path = eligible_note_path(f.get('path'))
        if path is None:
            continue
        require(path not in paths, 'Duplicate note path.')
        content = f['text']
        require(isinstance(content, str) and len(content) <= 2_000_000, 'Note is too large.')
        rid = 'md-' + hashlib.sha256(path.encode()).hexdigest()[:24]
        sid = 'source-' + rid
        paths[path] = rid
        title = Path(path).stem
        prose = markdown_prose(content)
        heading = re.search(r'^#\s+(.+)$', prose, re.M)
        if heading:
            title = heading[1].strip()
        tags = sorted(set(re.findall(r'(?<![\w/#])#([\w/-]+)', prose)))
        aliases = []
        front = re.match(r'^\ufeff?---\s*\n(.*?)\n---', content, re.S)
        if front:
            for field, target in [('tags', tags), ('aliases', aliases)]:
                match = re.search(r'^' + field + r':\s*\[([^\n]*)\]', front[1], re.M)
                if match:
                    target.extend(x.strip().strip('\'\"') for x in match[1].split(',') if x.strip())
        records.append({'id': rid, 'kind': 'artifact', 'title': title, 'summary': content, 'topics': sorted(set(tags)), 'aliases': aliases, 'claims': [], 'source_ids': [sid], 'sensitivity': 'general', 'coverage': 'local_markdown', 'dates': [], 'path': path})
        sources.append({'id': sid, 'title': path, 'kind': 'local_markdown', 'locator': {'relative_path': path}, 'verified_url': None, 'coverage': 'full_local_text', 'sensitivity': 'general'})
    for r in records:
        prose = markdown_prose(r['summary'])
        links = re.findall(r'(?<!!)\[\[([^\]]+)\]\]', prose)
        links += re.findall(r'(?<!!)\[[^\]]*\]\(([^)]+\.md(?:#[^)]*)?)\)', prose, re.I)
        for link in links:
            target = unquote(link.split('|')[0].split('#')[0].strip())
            if not target or re.match(r'^[a-z][a-z0-9+.-]*:', target, re.I):
                continue
            stem = lambda path: re.sub(r'\.md$', '', path, flags=re.I)
            target = stem(target)
            relative = posixpath.normpath(posixpath.join(posixpath.dirname(r['path']), target))
            candidates = [x for x in records if stem(x['path']) == relative]
            if not candidates:
                candidates = [x for x in records if stem(x['path']) == target]
            if not candidates:
                candidates = [x for x in records if Path(x['path']).stem == target or target in x.get('aliases', [])]
            unique = {x['id']: x for x in candidates}
            if len(unique) == 1 and r['id'] not in unique:
                to = next(iter(unique))
                eid = 'md-edge-' + digest([r['id'], to])[:24]
                if not any(e['id'] == eid for e in edges):
                    edges.append({'id': eid, 'from': r['id'], 'to': to, 'relation': 'links_to', 'basis': 'explicit', 'rationale': 'A Markdown link exists in ' + r['path'] + '. It does not establish dependency.', 'source_ids': r['source_ids']})
            elif len(unique) != 1:
                unresolved.append({'from': r['path'], 'target': target, 'matches': len(unique)})
    require(bool(records), 'No eligible Markdown notes found.')
    return {'schema_version': '1.0', 'created_date': now(), 'scope': 'User-selected local Markdown; one-way import', 'unresolved_links': unresolved, 'records': records, 'sources': sources, 'edges': edges}

def make_handler(store):
    token = secrets.token_hex(32)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def valid_host(self):
            return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')

        def send(self, value, status=200, mime='application/json; charset=utf-8'):
            data = json.dumps(value, ensure_ascii=False).encode() if mime.startswith('application/json') else value
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if not self.valid_host():
                return self.send({'error': 'Local access only.'}, 403)
            route = self.path.split('?')[0]
            if route == '/api/state':
                with store.lock:
                    return self.send({'state': store.state, 'token': token, 'data_path': str(store.path)})
            if route == '/api/backup':
                with store.lock:
                    return self.send(store.state)
            files = {'/context.js': ('context.js', 'text/javascript; charset=utf-8'), '/context-ui.js': ('context-ui.js', 'text/javascript; charset=utf-8'), '/context.css': ('context.css', 'text/css; charset=utf-8'), '/specimen.js': ('specimen.js', 'text/javascript; charset=utf-8'), '/specimen.css': ('specimen.css', 'text/css; charset=utf-8'), '/': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript; charset=utf-8'), '/catalog.js': ('catalog.js', 'text/javascript; charset=utf-8'), '/graph.js': ('graph.js', 'text/javascript; charset=utf-8'), '/style.css': ('style.css', 'text/css; charset=utf-8'), '/favicon.svg': ('favicon.svg', 'image/svg+xml')}
            if route in files:
                name, mime = files[route]
                return self.send((ROOT / 'public' / name).read_bytes(), mime=mime)
            return self.send({'error': 'Not found.'}, 404)

        def do_POST(self):
            if not self.valid_host() or self.headers.get('X-Tumbleweed-Token') != token:
                return self.send({'error': 'Reload this local app before saving.'}, 403)
            origin = self.headers.get('Origin')
            if origin and origin not in (f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'):
                return self.send({'error': 'Cross-origin requests are rejected.'}, 403)
            try:
                size = int(self.headers.get('Content-Length', '0'))
                limit = MAX_RESTORE_BYTES if self.path == '/api/restore' else MAX_BYTES
                require(0 < size <= limit, 'Backup exceeds the restore limit.' if self.path == '/api/restore' else 'Request exceeds the 24 MB import/save limit.')
                req = json.loads(self.rfile.read(size))
                require(isinstance(req, dict), 'Expected a JSON object.')
                if self.path == '/api/stop':
                    self.send({'stopping': True})
                    threading.Thread(target=self.server.shutdown, daemon=True).start()
                    return
                if self.path == '/api/preview':
                    if 'zip' in req:
                        files = []
                        raw = base64.b64decode(req['zip'], validate=True)
                        with zipfile.ZipFile(io.BytesIO(raw)) as z:
                            require(len(z.infolist()) <= 5000 and sum(i.file_size for i in z.infolist()) <= MAX_BYTES, 'ZIP is too large.')
                            for info in z.infolist():
                                if not info.is_dir() and info.filename.lower().endswith('.md') and eligible_note_path(info.filename):
                                    files.append({'path': info.filename, 'text': z.read(info).decode('utf-8-sig')})
                        g = markdown_graph(files)
                    elif 'files' in req:
                        g = markdown_graph(req['files'])
                    else:
                        g = req['graph']
                    with store.lock:
                        return self.send(store.preview(g, req['namespace']))
                if self.path in ('/api/mutate', '/api/restore'):
                    require(self.path != '/api/restore' or req.get('action') == 'restore', 'This endpoint accepts backups only.')
                    with store.lock:
                        return self.send({'state': store.mutate(req)})
                self.send({'error': 'Not found.'}, 404)
            except (ValueError, KeyError, TypeError, UnicodeError, zipfile.BadZipFile) as e:
                self.send({'error': str(e)}, 400)
            except Exception:
                self.send({'error': 'Could not save. Existing data has been retained. Check the data folder and restart.'}, 500)
    return Handler

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4318)
    parser.add_argument('--data-dir', default=str(ROOT / 'data'))
    args = parser.parse_args()
    # One writer per data folder, even if another process chooses a different port.
    Path(args.data_dir).mkdir(parents=True, exist_ok=True)
    instance_lock = open(Path(args.data_dir) / 'server.lock', 'a+b')
    if instance_lock.tell() == 0:
        instance_lock.write(b'0')
        instance_lock.flush()
    instance_lock.seek(0)
    try:
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(instance_lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(instance_lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        raise SystemExit('This data folder is already open in another Tumbleweed server.')
    store = Store(args.data_dir)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(store))
    print(f'Tumbleweed Local: http://127.0.0.1:{server.server_port}', flush=True)
    print(f'Saved workspace: {store.path}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
