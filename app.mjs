import {Playground} from './controller.mjs';
import {examples, exampleGuides} from './examples.mjs';

const source = document.querySelector('#source');
const run = document.querySelector('#run');
const stop = document.querySelector('#stop');
const load = document.querySelector('#load');
const example = document.querySelector('#example');
const output = document.querySelector('#output');
const status = document.querySelector('#status');
const description = document.querySelector('#example-description');
const suggestion = document.querySelector('#example-edit');
const expected = document.querySelector('#expected-output');
const title = document.querySelector('#example-title');
for (const [key, guide] of Object.entries(exampleGuides)) {
  const option = document.createElement('option');
  option.value = key;
  option.textContent = guide.title;
  example.append(option);
}
function showGuide(key) {
  const guide = exampleGuides[key];
  title.textContent = guide.title;
  description.textContent = guide.description;
  suggestion.textContent = guide.edit;
  expected.textContent = guide.expected;
}
showGuide('hello');
const playground = new Playground(data => {
  const busy = data.type === 'phase';
  run.disabled = busy;
  stop.disabled = !busy;
  load.disabled = busy;
  status.textContent = busy ? data.text : data.status === 0 ? 'Finished' : 'Stopped or failed';
  if (!busy) output.textContent = (data.stdout || '') + (data.stderr || '') || '(No output)';
});
run.addEventListener('click', () => {
  output.textContent = '';
  playground.run(source.value);
});
stop.addEventListener('click', () => playground.stop());
load.addEventListener('click', () => {
  source.value = examples[example.value];
  showGuide(example.value);
  output.textContent = 'Run a program to see its output here.';
  status.textContent = 'Ready';
  source.focus();
});
