"""Build a dependency-free Pages demo from the public application, never private data."""
from pathlib import Path
import json
import re
import shutil

ROOT=Path(__file__).resolve().parents[1]


def sample_workspace():
    state={'format':'tumbleweed-local-1','revision':0,'records':{},'sources':{},'edges':{},'batches':[],
           'bundles':{'sample':{'metadata':{'scope':'Entirely fictional demonstration records. No personal collection or real conversation export.'}}}}
    branches=[
        ('Garden & field', 'Plant a pocket garden', ['garden','water','observation'], [
            ('A week of watching the light','The north corner gets afternoon shade. The sunny strip dries first. These fictional observations suggest where to test two small beds; they do not establish a seasonal pattern.'),
            ('Water slowly, then check the soil','A narrow watering can made it easier to notice runoff. The sample log records a slower pass and a check below the surface, rather than assuming that wet leaves mean wet soil.'),
            ('The seed tray that taught patience','Two trays sprouted at different times. The earlier attempt changed light and watering together, so the result cannot tell us which change mattered.'),
            ('A plan for pollinators','Start with a few locally appropriate flowering plants and record visits. This sample proposal needs local species research before becoming a real planting plan.'),
            ('Sketching a very small raised bed','The mock sketch uses one reachable bed and a path wide enough to carry a watering can. The goal is an experiment that can be maintained, rather than a complete redesign.'),
            ('Keep a before-and-after field note','Record date, conditions, what changed and what stayed uncertain. A photograph may help, but the written note must say what it actually shows.')]),
        ('Craft & repair', 'Restore a reading chair', ['repair','materials','observation'], [
            ('Inspect before taking it apart','The fictional chair has a loose joint and an uneven finish. Separate the structural problem from the cosmetic one before choosing tools or materials.'),
            ('A repair log with useful photographs','Mark the view, part and observation. A close-up without context can be difficult to interpret later; a second image should show where the part belongs.'),
            ('The finish test that failed','The first mock test patch stayed tacky. The record does not prove the cause. Keep the test area small and read the material instructions before another attempt.'),
            ('Keep screws with their parts','Place removed hardware in labeled containers. The sample process favors one reversible step at a time and a clear place to resume.'),
            ('A good tool is one you can control','This fictional conversation compares a hand tool with a faster powered option. The tentative choice values control for the small job, not a universal rule about tools.'),
            ('A small offcut as a practice surface','Use scrap material to compare technique before touching the finished object. Keep the result and the conditions of the trial together.')]),
        ('Learning & research', 'Make a field guide to local birds', ['research','observation','writing'], [
            ('A question small enough to investigate','Begin with distinguishing three common birds by shape and behavior. A bounded question makes it easier to check observations against reliable references.'),
            ('Two sources can disagree usefully','The mock notes disagree about a field mark. Record the disagreement and its context rather than hiding it in a confident combined answer.'),
            ('Recall before rereading','Write what you remember, then check it against the source. The sample study log makes mistakes visible so the next review has a purpose.'),
            ('Build a source trail','Keep the title, locator and what was actually read. A short summary should not imply that the entire source was examined.'),
            ('An identification left unresolved','The sample sighting was brief and backlit. The note stays unknown rather than promoting a guess to a confirmed species.'),
            ('Explain a distinction in your own words','Use one observed example and one counterexample. The exercise is complete when the explanation makes the boundary understandable.')]),
        ('Community & place', 'Host a neighborhood repair afternoon', ['community','repair','planning'], [
            ('Start with a clear invitation','The fictional invitation gives a purpose, time window and what to bring. A small first gathering is easier to organize and learn from.'),
            ('A table for sharing tools','Label shared tools and agree on where each returns. This sample plan is an organizational idea, not a safety qualification or permission to repair any object.'),
            ('Leave room for different abilities','Offer a place to observe as well as participate. The mock plan asks what help people need instead of assuming everyone can use the same setup.'),
            ('A meeting note that ends with owners','Capture the decision, reason, next action and who volunteered. The sample uses role names only and contains no real participants.'),
            ('A quieter corner for conversation','The mock floor plan separates noisy work from discussion. Try it with a few chairs before committing to a larger arrangement.'),
            ('What the first gathering taught us','The fictional review records one success, one inconvenience and one change for next time. It preserves the outcome rather than claiming broad impact.')]),
        ('Design & making', 'Build a tiny reading lamp', ['design','materials','light'], [
            ('A lamp starts with a use','The sample brief is to illuminate a book without glare in the reader’s eyes. A rough prototype should test that use before its appearance is refined.'),
            ('Paper shades as quick prototypes','Three paper shapes were compared with a safe, finished battery light. The mock trial explores shape and light distribution; it is not an electrical build guide.'),
            ('Warm color, clear hierarchy','The fictional visual study uses a restrained palette and one brighter emphasis. The observation concerns readability, not a rule that every design needs the same colors.'),
            ('Measure the space before choosing a shape','The sample desk has little room beside a book. A cardboard outline helped compare footprints before choosing dimensions.'),
            ('A sketch with an explicit tradeoff','The wider shade reduces glare but takes more space. Keep both consequences in the design note so the choice can be reconsidered.'),
            ('The prototype is a question','A trial should answer something specific. This sample records the question, observation and next change instead of treating a polished object as proof.')]),
        ('Systems & habits', 'Create a reusable project pause ritual', ['planning','reflection','research'], [
            ('Make the next action visible','The fictional project stalled when its notes described an ambition rather than a concrete action. A small resume note made the starting point easier to find.'),
            ('One place for unfinished work','The sample experiment uses one tray for active materials. It records what was placed there so the tray does not become another unnamed pile.'),
            ('An exit note that earns its space','Record where you stopped, what to do next and what to put away. This mock note is short enough to complete before leaving.'),
            ('A weekly review with a stopping point','Check active projects, choose a next action and stop. The sample process avoids reorganizing every record on every review.'),
            ('Archive a project without erasing it','The fictional decision paused a project while keeping its sources and earlier effort. Archiving changes current attention, not the evidence of what happened.'),
            ('When a checklist needs to change','A repeated missed step can indicate an unclear instruction or poor placement. The sample review checks the cause before adding more items.')])]

    def relationship(eid,from_id,to_id,relation,rationale,basis='explicit',imported=False,source_id=None):
        if imported:
            raw={'id':eid,'from':from_id,'to':to_id,'relation':relation,'basis':basis,'rationale':rationale,'source_ids':[source_id] if source_id else []}
            key='sample::'+eid
            state['edges'][key]={'id':key,'namespace':'sample','external_id':eid,'from':'sample::'+from_id,'to':'sample::'+to_id,'relation':relation,'basis':basis,'rationale':rationale,'raw':raw}
        else:
            key='local-edge::'+eid;state['edges'][key]={'id':key,'from':from_id,'to':to_id,'relation':relation,'basis':basis,'rationale':rationale,'created_at':'2025-04-18T10:00:00Z'}

    for number,(collection,project,topics,notes) in enumerate(branches):
        for i,(title,summary) in enumerate(notes):
            rid=f'branch-{number}-note-{i}';sid='source-'+rid;key='sample::'+rid
            raw={'id':rid,'title':title,'summary':summary,'kind':'conversation' if i==4 else 'artifact','collection':collection,'topics':topics,
                 'sensitivity':'general','coverage':'direct_visible_messages' if i==4 else 'local_markdown','source_ids':[sid],
                 'claims':[{'text':'This is a fictional example, created to demonstrate source-aware notes.','status':'proposal_not_confirmed' if i==4 else 'sample_observation','source_ids':[sid]}],
                 'dates':[f'2025-04-{10+number+i:02d}']}
            if i==4:raw['messages']=[{'role':'user','text':'What can we learn from this small trial?','timestamp':'2025-04-18T10:00:00Z'},{'role':'assistant','text':summary,'timestamp':'2025-04-18T10:01:00Z'}]
            state['records'][key]={'id':key,'namespace':'sample','external_id':rid,'imported':True,'raw':raw,'annotations':{}}
            skey='sample::'+sid
            state['sources'][skey]={'id':skey,'namespace':'sample','external_id':sid,'raw':{'id':sid,'title':'Fictional notebook · '+title,'kind':'demo_sample','sensitivity':'general','coverage':'fictional_sample','verified_url':None,
                'read_scope':'Written for this demo. This is not a real source, private file or independently verified claim.','locator':{'sample':True,'notebook':collection,'page':i+1},'evidence':summary}}
        pid=f'local::project-{number}';state['records'][pid]={'id':pid,'kind':'project','title':project,'imported':False,'collection':collection,'topics':topics,
            'summary':'A fictional project: '+project.lower()+'. Start with a small, observable result and keep the knowledge that informed it close at hand.',
            'status':['active','planned','active','planned','paused','active'][number],
            'tasks':[{'text':'Inspect the attached notes and sources','done':True},{'text':'Choose one small trial','done':number%2==0},{'text':'Run the trial and record what happened','done':False},{'text':'Write the next concrete action','done':False}],
            'next_action':['Sketch two possible bed locations','Inspect the loose joint and record it','Compare the three observation notes','Draft the invitation and a short supply list','Compare the cardboard shade footprints','Try the exit note after one work session'][number],
            'stopped_at':'Collected a few useful notes and identified the first question.','put_away':'Return the materials and keep the notebook with the project.','created_at':'2025-04-18T10:00:00Z','updated_at':'2025-04-18T10:00:00Z'}
        for i in (0,2):relationship(f'project-{number}-context-{i}',f'sample::branch-{number}-note-{i}',pid,'informs','This sample record helps define a small first trial and its limits.')
        for i in (0,2,4):relationship(f'branch-{number}-link-{i}',f'branch-{number}-note-{i}',f'branch-{number}-note-{i+1}','related_to','These fictional notes examine different parts of the same small experiment.','explicit',True,f'source-branch-{number}-note-{i}')
        relationship(f'cross-{number}',f'sample::branch-{number}-note-5',f'sample::branch-{(number+1)%6}-note-0','related_to','A shared practice suggests a place to look. It does not establish a dependency.','inferred')
        nid=f'local::reflection-{number}';state['records'][nid]={'id':nid,'kind':'decision' if number%2 else 'note','title':['Keep the first garden small','Repair structure before appearance','Leave uncertain sightings unresolved','Start with one small gathering','Test the use before the shape','Keep the pause ritual brief'][number],
            'summary':'Fictional reflection: choose a manageable next step, preserve the reasons, and revisit the choice after observing the result. Alternatives remain available; this is a sample commitment, not an instruction to the visitor.',
            'collection':collection,'topics':topics,'status':'reference','created_at':'2025-04-20T12:00:00Z','imported':False}
    return state


def build():
    destination=ROOT/'docs';destination.mkdir(exist_ok=True)
    names=['index.html','app.js','catalog.js','graph.js','specimen.js','style.css','specimen.css','favicon.svg']
    for name in names:
        text=(ROOT/'public'/name).read_text(encoding='utf8')
        if name=='index.html':
            text=re.sub(r'(src|href)="/(?!/)',r'\1="./',text)
            text=text.replace('<title>Tumbleweed · Local knowledge workspace</title>','<title>Tumbleweed · Live demo</title><meta name="description" content="A living knowledge base with projects built in. Explore fictional records, gather ideas, and make something of them."><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; connect-src \'self\'; object-src \'none\'; base-uri \'none\'">')
            text=text.replace('<script src="./app.js" defer></script>','<script src="./demo-data.js" defer></script><script src="./demo-model.js" defer></script><script src="./demo-store.js" defer></script><script src="./app.js" defer></script><script src="./demo-ui.js" defer></script><link rel="stylesheet" href="./demo.css">')
            text=text.replace('Only on this computer','Your browser copy').replace('Connecting…','Opening demo…').replace('Import Markdown & backups','Demo workspace & backups').replace('Save on this computer','Save in this browser')
            text=text.replace('</body>','<aside class="demo-banner" aria-label="Demo status"><span>DEMO · FICTIONAL DATA</span><button id="demo-banner-reset">Reset demo</button></aside></body>')
        elif name=='app.js':
            marker="async function api(path, body) {\n";assert marker in text
            text=text.replace(marker,marker+' return TumbleweedDemo.request(path,body);\n /* Local HTTP transport is not used in the static demo.\n',1)
            end=' return result;\n}\nasync function load()';assert end in text
            text=text.replace(end,' return result; */\n}\nasync function load()',1)
            text=text.replace("'Saved on disk · revision '+state.revision",'TumbleweedDemo.savedLabel(state.revision)')
            text=text.replace('Start Tumbleweed using Start Tumbleweed.cmd, then reload.','Reload the demo and check that browser storage is available.')
            text=text.replace('Saved locally.','Saved in this browser.').replace('A disk backup is saved before the change.','Your previous browser workspace is retained before the change.').replace('A backup is saved first.','Your previous browser workspace is retained first.')
        elif name=='specimen.js':text=text.replace('YOUR COLLECTION','SAMPLE COLLECTION')
        if name!='index.html':text=text.replace('/favicon.svg','./favicon.svg')
        (destination/name).write_text(text,encoding='utf8')
    for source,target in [('model.js','demo-model.js'),('store.js','demo-store.js'),('ui.js','demo-ui.js'),('demo.css','demo.css')]:shutil.copyfile(ROOT/'demo'/source,destination/target)
    (destination/'demo-data.js').write_text("'use strict';\nconst TumbleweedDemoSeed="+json.dumps(sample_workspace(),ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8')
    (destination/'.nojekyll').write_text('',encoding='utf8')
    print('Built GitHub Pages demo:',len(sample_workspace()['records']),'fictional records; no private input read.')


if __name__=='__main__':build()
