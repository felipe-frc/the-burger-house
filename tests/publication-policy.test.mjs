import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
test('legitimate project images remain public while every historical address alias stays blocked', () => {
  const policy=JSON.parse(readFileSync('publication-policy.json','utf8'));
  for(const name of ['home','cardapio','cart','pedido']) assert(!policy.privatePaths.includes(`docs/images/${name}.png`));
  for(const name of ['endereco','revisao','address','review']) assert(policy.privatePaths.includes(`docs/images/${name}.png`));
  const expectedCommits = new Set(['879f08294049151c0183929f56cd7b171a2da9bc', 'cc43d296c5598740514980a7f4bf9d32ef4a8f51']);
  const exceptions = policy.historicalSyntheticExceptions ?? [];
  assert.deepEqual(exceptions.map(e => e.path).sort(), [
    'docs/images/address.png', 'docs/images/endereco.png', 'docs/images/review.png', 'docs/images/revisao.png',
  ]);
  for (const item of exceptions) {
    assert(expectedCommits.has(item.commit));
    assert.match(item.blob, /^[a-f0-9]{40}$/);
  }
});
test('automatic backend CI contains build and tests, without any deployment job or Azure login', () => {
  const source=readFileSync('.github/workflows/backend-deploy.yml','utf8'), workflow=yaml.load(source);
  assert(workflow.on.push); assert(workflow.on.pull_request); assert('workflow_call' in workflow.on);
  assert.deepEqual(Object.keys(workflow.jobs),['build']);
  assert(source.includes('dotnet test')); assert(source.includes('dotnet build'));
  assert(!source.includes('azure/login')); assert(!source.includes('azure/webapps-deploy'));
});
test('production deploy is opt-in, main-only, uses CI and a protected environment boundary', () => {
  const workflow=yaml.load(readFileSync('.github/workflows/backend-deploy-manual.yml','utf8'));
  assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);
  assert.equal(workflow.on.workflow_dispatch.inputs.confirm_production.default,false);
  assert.equal(workflow.jobs.build.uses,'./.github/workflows/backend-deploy.yml');
  assert.match(workflow.jobs.deploy.if,/refs\/heads\/main/); assert.match(workflow.jobs.deploy.if,/confirm_production == true/);
  assert.equal(workflow.jobs.deploy.environment,'Production');
});
test('portfolio source explicitly disables automatic Vercel Git deployments', () => {
  const configuration=JSON.parse(readFileSync('vercel.json','utf8'));
  assert.equal(configuration.git.deploymentEnabled,false);
  assert.equal(configuration.buildCommand,'npm run build:vercel');
});
