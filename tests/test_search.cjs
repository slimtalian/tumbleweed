const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(__dirname+'/../public/app.js','utf8');const start=code.indexOf('function parseKnowledgeSearch('),end=code.indexOf('function showKnowledgeSearch(',start);const c=vm.createContext({});vm.runInContext(code.slice(start,end),c);
const parse=s=>c.parseKnowledgeSearch(s,['Journal','CMMC Reference','Garden & field','Projects']);
let q=parse('journal:day 41');assert.deepEqual(Array.from(q.terms),['day','41']);assert.equal(q.scopes[0].value,'Journal');assert.equal(c.matchesKnowledgeScopes({collection:'Projects',summary:'journal day 41'},q),false);assert.equal(c.matchesKnowledgeScopes({collection:'Journal'},q),true);
for(const value of ['in:"CMMC Reference" audit','collection:"CMMC Reference" audit','CMMC-Reference:audit']){q=parse(value);assert.equal(q.error,'');assert.equal(q.scopes[0].value,'CMMC Reference');assert.equal(q.terms[0],'audit');}
q=parse('in:"Garden & field" topic:water type:project "soil test"');assert.equal(c.matchesKnowledgeScopes({collection:'Garden & field',topics:['water'],kind:'project'},q),true);assert.equal(c.matchesKnowledgeScopes({collection:'Garden & field',topics:['water'],kind:'note'},q),false);assert.equal(q.terms[0],'soil test');
for(const value of ['journla:day 41','in:missing','topic:','"unclosed']){q=parse(value);assert.ok(q.error);assert.equal(c.matchesKnowledgeScopes({collection:'Journal'},q),false);}
q=parse('https://example.test:8080 "day 41"');assert.equal(q.error,'');assert.equal(q.terms[0],'https://example.test:8080');assert.equal(q.terms[1],'day 41');
assert.equal(parse('JOURNAL:Day').scopes[0].value,'Journal');assert.equal(parse('journal:').terms.length,0);assert.equal(c.matchesKnowledgeScopes({collection:'Other'},parse('')),true);
console.log('PASS scoped search: collections, shorthand, quoted phrases, combined filters, errors, URLs and existing-record matching');
